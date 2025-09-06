const express = require('express');
const { Transform } = require('json2csv');
const Joi = require('joi');
const promiseRetry = require('promise-retry');

const router = express.Router({ mergeParams: true });

const orderItemSchema = Joi.object({
  item_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().positive().required(),
  price: Joi.number().min(0).required(),
  name: Joi.string().optional()
});

// Define a custom Joi schema for is_delivery to accept both boolean and numeric (0/1) values
const isDeliverySchema = Joi.alternatives().try(
  Joi.boolean(),
  Joi.number().valid(0, 1).custom((value, helpers) => {
    // Convert 1 to true and 0 to false
    return value === 1 ? true : value === 0 ? false : helpers.error('any.invalid');
  }, 'Convert numeric to boolean')
);

const orderSchema = Joi.object({
  items: Joi.array().items(orderItemSchema).min(1).required(),
  status: Joi.string().valid('pending', 'preparing', 'completed', 'enroute', 'delivered', 'canceled').optional(),
  customerName: Joi.string().optional().allow(null),
  customerPhone: Joi.string().optional().allow(null),
  is_delivery: isDeliverySchema.optional(),
  customer_location: Joi.string().when('is_delivery', { is: true, then: Joi.required(), otherwise: Joi.optional().allow(null) }),
  rider_id: Joi.number().integer().positive().optional().allow(null)
});

const updateSchema = Joi.object({
  items: Joi.array().items(orderItemSchema).min(1).optional(),
  status: Joi.string().valid('pending', 'preparing', 'completed', 'enroute', 'delivered', 'canceled').optional(),
  customerName: Joi.string().optional().allow(null),
  customerPhone: Joi.string().optional().allow(null),
  is_delivery: isDeliverySchema.optional(),
  customer_location: Joi.string().optional().allow(null),
  rider_id: Joi.number().integer().positive().optional().allow(null)
}).min(1); // At least one field to update

const publicOrderSchema = Joi.object({
  items: Joi.array().items(orderItemSchema).min(1).required(),
  customerName: Joi.string().required(),
  customerPhone: Joi.string().required(),
  is_delivery: isDeliverySchema.optional(),
  customer_location: Joi.string().when('is_delivery', { is: true, then: Joi.required(), otherwise: Joi.optional().allow(null) })
});

const MAX_ITEMS_PER_ORDER = 100;
const MAX_TOTAL_PRICE = 10000;

const validTransitions = {
  pending: ['preparing', 'canceled'],
  preparing: ['completed', 'canceled'],
  completed: ['enroute', 'canceled'],
  enroute: ['delivered'],
  delivered: [],
  canceled: []
};

module.exports = ({ pool, authenticateToken, restrictToManager, restrictToManagerKitchenOrRider, broadcastOrderNotification, logger, rateLimit }) => {
  // Common function to create orders
  async function createOrder({ tenantId, items, customerName, customerPhone, is_delivery, customer_location, status = 'pending', rider_id, user, isPublic = false }) {
    const schema = isPublic ? publicOrderSchema : orderSchema;
    let validateObj = { items, customerName, customerPhone, is_delivery, customer_location };
    if (!isPublic) {
      validateObj.status = status;
      validateObj.rider_id = rider_id;
    }
    const { error: validationError, value } = schema.validate(validateObj, { convert: true });
    if (validationError) {
      throw new Error(validationError.message);
    }

    // Use validated and converted values
    is_delivery = value.is_delivery;
    customer_location = value.customer_location;

    // Check for duplicate item_ids
    const itemIds = items.map(item => item.item_id);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new Error('Duplicate item IDs are not allowed');
    }

    // Check order size and price limits
    if (items.length > MAX_ITEMS_PER_ORDER) {
      throw new Error(`Order cannot contain more than ${MAX_ITEMS_PER_ORDER} items`);
    }

    // Check if tenant exists
    const [tenants] = await pool.query('SELECT tenant_id FROM tenants WHERE tenant_id = ?', [tenantId]);
    if (tenants.length === 0) {
      throw new Error('Tenant not found');
    }

    // Fetch menu items in bulk
    const [menuItems] = await pool.query(
      'SELECT item_id, name, price, stock_quantity FROM menu_items WHERE tenant_id = ? AND item_id IN (?) FOR UPDATE',
      [tenantId, itemIds]
    );
    const menuItemMap = new Map(menuItems.map(item => [item.item_id, item]));

    // Validate items and stock
    for (const item of items) {
      const menuItem = menuItemMap.get(item.item_id);
      if (!menuItem) {
        throw new Error(`Menu item with ID ${item.item_id} not found`);
      }
      if (menuItem.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${menuItem.name}. Available: ${menuItem.stock_quantity}`);
      }
      item.price = parseFloat(menuItem.price);
      item.name = menuItem.name;
    }

    // Validate rider_id for delivery orders
    let assignedRiderId = null;
    if (is_delivery && rider_id && !isPublic && ['manager', 'kitchen'].includes(user.role)) {
      const [riders] = await pool.query(
        'SELECT user_id FROM users WHERE tenant_id = ? AND role = ? AND user_id = ?',
        [tenantId, 'rider', rider_id]
      );
      if (riders.length === 0) {
        throw new Error('Invalid rider ID');
      }
      const [activeOrders] = await pool.query(
        'SELECT order_id FROM orders WHERE tenant_id = ? AND rider_id = ? AND status = ?',
        [tenantId, rider_id, 'enroute']
      );
      if (activeOrders.length > 0) {
        throw new Error('Selected rider is currently enroute on another order');
      }
      assignedRiderId = rider_id;
    }

    // Calculate total price
    const totalPrice = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    if (totalPrice > MAX_TOTAL_PRICE) {
      throw new Error(`Total price cannot exceed $${MAX_TOTAL_PRICE}`);
    }

    // Execute transaction with retry
    return await promiseRetry(async (retry) => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // Update stock
        for (const item of items) {
          await connection.query(
            'UPDATE menu_items SET stock_quantity = stock_quantity - ? WHERE item_id = ? AND tenant_id = ?',
            [item.quantity, item.item_id, tenantId]
          );
        }

        // Insert order
        const preparationStartTime = status === 'preparing' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
        const [result] = await connection.query(
          'INSERT INTO orders (tenant_id, total_price, status, customer_name, customer_phone, preparation_start_time, is_delivery, customer_location, rider_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [tenantId, totalPrice, status, customerName || null, customerPhone || null, preparationStartTime, is_delivery || 0, customer_location || null, assignedRiderId]
        );

        // Insert order items with name
        for (const item of items) {
          await connection.query(
            'INSERT INTO order_items (order_id, tenant_id, item_id, quantity, price, name) VALUES (?, ?, ?, ?, ?, ?)',
            [result.insertId, tenantId, item.item_id, item.quantity, item.price, item.name]
          );
        }

        // Insert order history
        const orderDetails = items.map(item => ({
          item_id: item.item_id,
          name: item.name,
          quantity: item.quantity,
          price: parseFloat(item.price),
        }));
        await connection.query(
          'INSERT INTO order_history (history_id, order_id, tenant_id, action, details, changed_by) VALUES (UUID(), ?, ?, ?, ?, ?)',
          [
            result.insertId,
            tenantId,
            'created',
            JSON.stringify({
              items: orderDetails,
              total_price: totalPrice,
              status,
              customerName,
              customerPhone,
              preparation_start_time: preparationStartTime,
              is_delivery,
              customer_location,
              rider_id: assignedRiderId,
            }),
            isPublic ? 'customer' : user.username,
          ]
        );

        await connection.commit();

        // Broadcast notification
        const newOrder = {
          order_id: result.insertId,
          items: orderDetails,
          total_price: totalPrice,
          status,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          preparation_start_time: preparationStartTime,
          preparation_end_time: null,
          delivery_start_time: null,
          delivery_end_time: null,
          is_delivery,
          customer_location,
          rider_id: assignedRiderId,
        };
        broadcastOrderNotification(tenantId, newOrder);

        return { success: true, orderId: result.insertId, customerName, customerPhone };
      } catch (error) {
        await connection.rollback();
        retry(error);
      } finally {
        connection.release();
      }
    }, { retries: 3 });
  }

  // Rate limit for public orders
  const publicOrderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Too many orders created, please try again later'
  });

  // Create order (authenticated)
  router.post('/orders', authenticateToken, async (req, res) => {
    const { tenantId } = req.params;
    const { items, status, customerName, customerPhone, is_delivery, customer_location, rider_id } = req.body;
    if (req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized tenant' });
    }

    try {
      const result = await createOrder({
        tenantId,
        items,
        customerName,
        customerPhone,
        is_delivery,
        customer_location,
        status,
        rider_id,
        user: req.user
      });
      res.json(result);
    } catch (error) {
      res.status(error.message.includes('not found') ? 404 : 400).json({ error: error.message });
    }
  });

 // Create order (public)
router.post('/public/orders', publicOrderLimiter, async (req, res) => {
  const { tenantId } = req.params;
  const { items, customerName, customerPhone, is_delivery, customer_location } = req.body;
  // Explicitly create a clean object without status
  const cleanBody = { items, customerName, customerPhone, is_delivery, customer_location };

  try {
    const result = await createOrder({
      tenantId,
      items: cleanBody.items,
      customerName: cleanBody.customerName,
      customerPhone: cleanBody.customerPhone,
      is_delivery: cleanBody.is_delivery,
      customer_location: cleanBody.customer_location,
      user: { username: 'customer' },
      isPublic: true
    });
    res.json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 400).json({ error: error.message });
  }
});

  // Get order status (public)
  router.get('/public/orders/:orderId/status', async (req, res) => {
    const { tenantId, orderId } = req.params;
    const { customerPhone } = req.query;

    try {
      if (!customerPhone || typeof customerPhone !== 'string') {
        return res.status(400).json({ error: 'Customer phone is required and must be a string' });
      }

      const [tenants] = await pool.query('SELECT tenant_id FROM tenants WHERE tenant_id = ?', [tenantId]);
      if (tenants.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const [orders] = await pool.query(
        'SELECT order_id, total_price, status, customer_name, customer_phone, preparation_start_time, preparation_end_time, delivery_start_time, delivery_end_time, is_delivery, customer_location FROM orders WHERE tenant_id = ? AND order_id = ? AND customer_phone = ?',
        [tenantId, orderId, customerPhone]
      );
      if (orders.length === 0) {
        return res.status(404).json({ error: 'Order not found or phone number does not match' });
      }
      const order = orders[0];

      const [items] = await pool.query(
        'SELECT item_id, name, quantity, price FROM order_items WHERE order_id = ? AND tenant_id = ?',
        [orderId, tenantId]
      );
      const formattedItems = items.map(item => ({
        item_id: parseInt(item.item_id),
        name: item.name,
        quantity: parseInt(item.quantity),
        price: parseFloat(item.price),
      }));

      res.json({
        order_id: parseInt(order.order_id),
        items: formattedItems,
        total_price: parseFloat(order.total_price),
        status: order.status,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        preparation_start_time: order.preparation_start_time,
        preparation_end_time: order.preparation_end_time,
        delivery_start_time: order.delivery_start_time,
        delivery_end_time: order.delivery_end_time,
        is_delivery: !!parseInt(order.is_delivery), // Ensure boolean output
        customer_location: order.customer_location,
      });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update order
  router.put('/orders/:orderId', authenticateToken, restrictToManagerKitchenOrRider, async (req, res) => {
    const { tenantId, orderId } = req.params;
    if (req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized tenant' });
    }

    try {
      const { error: validationError, value } = updateSchema.validate(req.body, { convert: true });
      if (validationError) {
        return res.status(400).json({ error: validationError.message });
      }

      // Check if order exists
      const [orders] = await pool.query('SELECT * FROM orders WHERE order_id = ? AND tenant_id = ?', [orderId, tenantId]);
      if (orders.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const existingOrder = orders[0];

      // Prevent updates if order is delivered
      if (existingOrder.status === 'delivered') {
        return res.status(403).json({ error: 'Order is delivered and cannot be modified' });
      }

      // Fetch existing items
      const [existingItems] = await pool.query(
        'SELECT item_id, name, quantity, price FROM order_items WHERE order_id = ? AND tenant_id = ?',
        [orderId, tenantId]
      );

      // Define new values, falling back to existing
      const newStatus = value.status || existingOrder.status;
      const newCustomerName = value.customerName !== undefined ? value.customerName : existingOrder.customer_name;
      const newCustomerPhone = value.customerPhone !== undefined ? value.customerPhone : existingOrder.customer_phone;
      const newIsDelivery = value.is_delivery !== undefined ? value.is_delivery : !!existingOrder.is_delivery;
      const newCustomerLocation = value.customer_location !== undefined ? value.customer_location : existingOrder.customer_location;
      const newRiderId = value.rider_id !== undefined ? value.rider_id : existingOrder.rider_id;

      // Validate customer location if delivery
      if (newIsDelivery && !newCustomerLocation) {
        return res.status(400).json({ error: 'Customer location required for delivery orders' });
      }

      // Validate status transition only if changing
      if (newStatus !== existingOrder.status && !validTransitions[existingOrder.status].includes(newStatus)) {
        return res.status(400).json({ error: `Invalid status transition from ${existingOrder.status} to ${newStatus}` });
      }

      let newItems = null;
      let newTotalPrice = parseFloat(existingOrder.total_price);
      const stockAdjustments = new Map();

      if (value.items) {
        const items = value.items;
        // Check for duplicate item_ids
        const itemIds = items.map(item => item.item_id);
        if (new Set(itemIds).size !== itemIds.length) {
          return res.status(400).json({ error: 'Duplicate item IDs are not allowed' });
        }

        // Check order size
        if (items.length > MAX_ITEMS_PER_ORDER) {
          return res.status(400).json({ error: `Order cannot contain more than ${MAX_ITEMS_PER_ORDER} items` });
        }

        // Fetch menu items
        const [menuItems] = await pool.query(
          'SELECT item_id, name, price, stock_quantity FROM menu_items WHERE tenant_id = ? AND item_id IN (?) FOR UPDATE',
          [tenantId, itemIds]
        );
        const menuItemMap = new Map(menuItems.map(item => [item.item_id, item]));

        newItems = [];
        for (const item of items) {
          const menuItem = menuItemMap.get(item.item_id);
          if (!menuItem) {
            return res.status(404).json({ error: `Menu item with ID ${item.item_id} not found` });
          }
          const price = parseFloat(menuItem.price);
          const name = menuItem.name;
          newItems.push({ item_id: item.item_id, quantity: item.quantity, price, name });

          // Calculate stock diff
          const existingItem = existingItems.find(e => e.item_id === item.item_id);
          const existingQty = existingItem ? existingItem.quantity : 0;
          const diff = item.quantity - existingQty;
          if (diff > 0 && menuItem.stock_quantity < diff) {
            return res.status(400).json({ error: `Insufficient stock for ${name}. Available: ${menuItem.stock_quantity}` });
          }
          stockAdjustments.set(item.item_id, diff);
        }

        // Handle removed items
        for (const exItem of existingItems) {
          if (!items.find(i => i.item_id === exItem.item_id)) {
            stockAdjustments.set(exItem.item_id, -exItem.quantity);
          }
        }

        newTotalPrice = newItems.reduce((sum, i) => sum + i.quantity * i.price, 0);
        if (newTotalPrice > MAX_TOTAL_PRICE) {
          return res.status(400).json({ error: `Total price cannot exceed $${MAX_TOTAL_PRICE}` });
        }
      }

      // Rider assignment logic
      let assignedRiderId = newRiderId;
      if (newStatus === 'enroute' && !assignedRiderId && req.user.role === 'rider') {
        assignedRiderId = req.user.userId;
      } else if (newIsDelivery && assignedRiderId && ['manager', 'kitchen'].includes(req.user.role)) {
        const [riders] = await pool.query(
          'SELECT user_id FROM users WHERE tenant_id = ? AND role = ? AND user_id = ?',
          [tenantId, 'rider', assignedRiderId]
        );
        if (riders.length === 0) {
          throw new Error('Invalid rider ID');
        }
        const [activeOrders] = await pool.query(
          'SELECT order_id FROM orders WHERE tenant_id = ? AND rider_id = ? AND status = ? AND order_id != ?',
          [tenantId, assignedRiderId, 'enroute', orderId]
        );
        if (activeOrders.length > 0) {
          throw new Error('Selected rider is currently enroute on another order');
        }
      }

      // Execute transaction with retry
      await promiseRetry(async (retry) => {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          // Update stock if items changed
          if (value.items) {
            for (const [itemId, diff] of stockAdjustments) {
              if (diff !== 0) {
                await connection.query(
                  'UPDATE menu_items SET stock_quantity = stock_quantity - ? WHERE item_id = ? AND tenant_id = ?',
                  [diff, itemId, tenantId]
                );
              }
            }

            // Update order items
            await connection.query('DELETE FROM order_items WHERE order_id = ? AND tenant_id = ?', [orderId, tenantId]);
            for (const item of newItems) {
              await connection.query(
                'INSERT INTO order_items (order_id, tenant_id, item_id, quantity, price, name) VALUES (?, ?, ?, ?, ?, ?)',
                [orderId, tenantId, item.item_id, item.quantity, item.price, item.name]
              );
            }
          }

          // Calculate times
          const preparationStartTime = (newStatus === 'preparing' && existingOrder.status !== 'preparing') ? new Date().toISOString().slice(0, 19).replace('T', ' ') : existingOrder.preparation_start_time;
          const preparationEndTime = (newStatus === 'completed' && existingOrder.status !== 'completed') ? new Date().toISOString().slice(0, 19).replace('T', ' ') : existingOrder.preparation_end_time;
          const deliveryStartTime = (newStatus === 'enroute' && existingOrder.status !== 'enroute') ? new Date().toISOString().slice(0, 19).replace('T', ' ') : existingOrder.delivery_start_time;
          const deliveryEndTime = (newStatus === 'delivered' && existingOrder.status !== 'delivered') ? new Date().toISOString().slice(0, 19).replace('T', ' ') : existingOrder.delivery_end_time;

          // Update order
          await connection.query(
            'UPDATE orders SET total_price = ?, status = ?, customer_name = ?, customer_phone = ?, preparation_start_time = ?, preparation_end_time = ?, is_delivery = ?, customer_location = ?, delivery_start_time = ?, delivery_end_time = ?, rider_id = ? WHERE order_id = ? AND tenant_id = ?',
            [newTotalPrice, newStatus, newCustomerName, newCustomerPhone, preparationStartTime, preparationEndTime, newIsDelivery ? 1 : 0, newCustomerLocation, deliveryStartTime, deliveryEndTime, assignedRiderId, orderId, tenantId]
          );

          // Prepare order details for history
          const orderDetails = (value.items ? newItems : existingItems).map(item => ({
            item_id: item.item_id,
            name: item.name,
            quantity: item.quantity,
            price: parseFloat(item.price)
          }));

          // Insert order history
          await connection.query(
            'INSERT INTO order_history (history_id, order_id, tenant_id, action, details, changed_by) VALUES (UUID(), ?, ?, ?, ?, ?)',
            [
              orderId,
              tenantId,
              'updated',
              JSON.stringify({
                items: orderDetails,
                total_price: newTotalPrice,
                status: newStatus,
                customerName: newCustomerName,
                customerPhone: newCustomerPhone,
                preparation_start_time: preparationStartTime,
                preparation_end_time: preparationEndTime,
                delivery_start_time: deliveryStartTime,
                delivery_end_time: deliveryEndTime,
                is_delivery: newIsDelivery,
                customer_location: newCustomerLocation,
                rider_id: assignedRiderId,
              }),
              req.user.username,
            ]
          );

          await connection.commit();

          // Broadcast notification
          const updatedOrder = {
            order_id: parseInt(orderId),
            items: orderDetails,
            total_price: newTotalPrice,
            status: newStatus,
            customer_name: newCustomerName || null,
            customer_phone: newCustomerPhone || null,
            preparation_start_time: preparationStartTime,
            preparation_end_time: preparationEndTime,
            delivery_start_time: deliveryStartTime,
            delivery_end_time: deliveryEndTime,
            is_delivery: newIsDelivery,
            customer_location: newCustomerLocation,
            rider_id: assignedRiderId,
          };
          broadcastOrderNotification(tenantId, updatedOrder, 'order_updated');

          res.json({ success: true });
        } catch (error) {
          await connection.rollback();
          retry(error);
        } finally {
          connection.release();
        }
      }, { retries: 3 });
    } catch (error) {
      res.status(error.message.includes('not found') ? 404 : 400).json({ error: error.message });
    }
  });

  // Delete order
  router.delete('/orders/:orderId', authenticateToken, restrictToManager, async (req, res) => {
    const { tenantId, orderId } = req.params;
    if (req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized tenant' });
    }

    try {
      const [orders] = await pool.query('SELECT * FROM orders WHERE order_id = ? AND tenant_id = ?', [orderId, tenantId]);
      if (orders.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const order = orders[0];

      if (order.status === 'delivered') {
        return res.status(403).json({ error: 'Order is delivered and cannot be deleted' });
      }

      const [items] = await pool.query(
        'SELECT item_id, name, quantity, price FROM order_items WHERE order_id = ? AND tenant_id = ?',
        [orderId, tenantId]
      );

      await promiseRetry(async (retry) => {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          // Restore stock
          for (const item of items) {
            await connection.query(
              'UPDATE menu_items SET stock_quantity = stock_quantity + ? WHERE item_id = ? AND tenant_id = ?',
              [item.quantity, item.item_id, tenantId]
            );
          }

          // Insert order history
          const orderDetails = items.map(item => ({
            item_id: item.item_id,
            name: item.name,
            quantity: item.quantity,
            price: parseFloat(item.price),
          }));
          await connection.query(
            'INSERT INTO order_history (history_id, order_id, tenant_id, action, details, changed_by) VALUES (UUID(), ?, ?, ?, ?, ?)',
            [
              orderId,
              tenantId,
              'canceled',
              JSON.stringify({
                items: orderDetails,
                total_price: parseFloat(order.total_price),
                status: 'canceled',
                customerName: order.customer_name,
                customerPhone: order.customer_phone,
                is_delivery: !!parseInt(order.is_delivery), // Ensure boolean output
                customer_location: order.customer_location,
                rider_id: order.rider_id,
              }),
              req.user.username,
            ]
          );

          // Delete order
          await connection.query('DELETE FROM orders WHERE order_id = ? AND tenant_id = ?', [orderId, tenantId]);

          await connection.commit();

          // Broadcast notification
          const canceledOrder = {
            order_id: parseInt(orderId),
            items: orderDetails,
            total_price: parseFloat(order.total_price),
            status: 'canceled',
            customer_name: order.customer_name || null,
            customer_phone: order.customer_phone || null,
            preparation_start_time: order.preparation_start_time || null,
            preparation_end_time: order.preparation_end_time || null,
            delivery_start_time: order.delivery_start_time || null,
            delivery_end_time: order.delivery_end_time || null,
            is_delivery: !!parseInt(order.is_delivery), // Ensure boolean output
            customer_location: order.customer_location || null,
            rider_id: order.rider_id || null,
          };
          broadcastOrderNotification(tenantId, canceledOrder, 'order_updated');

          res.json({ success: true });
        } catch (error) {
          await connection.rollback();
          retry(error);
        } finally {
          connection.release();
        }
      }, { retries: 3 });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get orders
  router.get('/orders', authenticateToken, async (req, res) => {
    const { tenantId } = req.params;
    const { status, sortBy = 'created_at', sortOrder = 'DESC', search, page = 1, limit = 50 } = req.query;
    if (req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized tenant' });
    }

    try {
      let query = 'SELECT order_id, total_price, status, customer_name, customer_phone, created_at, preparation_start_time, preparation_end_time, delivery_start_time, delivery_end_time, is_delivery, customer_location, rider_id FROM orders WHERE tenant_id = ?';
      const params = [tenantId];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (search) {
        query += ' AND (customer_name LIKE ? OR customer_phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      if (['order_id', 'total_price', 'created_at'].includes(sortBy)) {
        query += ` ORDER BY ${sortBy} ${sortOrder === 'ASC' ? 'ASC' : 'DESC'}`;
      } else {
        query += ' ORDER BY created_at DESC';
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query += ' LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);

      const [orders] = await pool.query(query, params);
      const formattedOrders = [];
      for (const order of orders) {
        const [items] = await pool.query(
          'SELECT item_id, name, quantity, price FROM order_items WHERE order_id = ? AND tenant_id = ?',
          [order.order_id, tenantId]
        );
        const formattedItems = items.map(item => ({
          item_id: parseInt(item.item_id),
          name: item.name,
          quantity: parseInt(item.quantity),
          price: parseFloat(item.price),
        }));
        formattedOrders.push({
          order_id: parseInt(order.order_id),
          items: formattedItems,
          total_price: parseFloat(order.total_price),
          status: order.status,
          customer_name: order.customer_name || null,
          customer_phone: order.customer_phone || null,
          created_at: order.created_at,
          preparation_start_time: order.preparation_start_time,
          preparation_end_time: order.preparation_end_time,
          delivery_start_time: order.delivery_start_time,
          delivery_end_time: order.delivery_end_time,
          is_delivery: !!parseInt(order.is_delivery), // Ensure boolean output
          customer_location: order.customer_location,
          rider_id: parseInt(order.rider_id) || null,
        });
      }
      res.json(formattedOrders);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Export orders to CSV
  router.get('/orders/export', authenticateToken, restrictToManager, async (req, res) => {
    const { tenantId } = req.params;
    const { status, sortBy = 'created_at', sortOrder = 'DESC', search } = req.query;
    if (req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized tenant' });
    }

    try {
      let query = 'SELECT order_id, total_price, status, customer_name, customer_phone, created_at, preparation_start_time, preparation_end_time, delivery_start_time, delivery_end_time, is_delivery, customer_location, rider_id FROM orders WHERE tenant_id = ?';
      const params = [tenantId];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (search) {
        query += ' AND (customer_name LIKE ? OR customer_phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      if (['order_id', 'total_price', 'created_at'].includes(sortBy)) {
        query += ` ORDER BY ${sortBy} ${sortOrder === 'ASC' ? 'ASC' : 'DESC'}`;
      } else {
        query += ' ORDER BY created_at DESC';
      }

      const [orders] = await pool.query(query, params);
      const exportData = [];

      for (const order of orders) {
        const [items] = await pool.query(
          'SELECT item_id, name, quantity, price FROM order_items WHERE order_id = ? AND tenant_id = ?',
          [order.order_id, tenantId]
        );
        const itemsStr = items.map(item => `${item.name} (Qty: ${item.quantity}, Price: $${item.price})`).join('; ');
        exportData.push({
          order_id: parseInt(order.order_id),
          total_price: parseFloat(order.total_price),
          status: order.status,
          customer_name: order.customer_name || 'N/A',
          customer_phone: order.customer_phone || 'N/A',
          created_at: order.created_at,
          preparation_start_time: order.preparation_start_time || 'N/A',
          preparation_end_time: order.preparation_end_time || 'N/A',
          delivery_start_time: order.delivery_start_time || 'N/A',
          delivery_end_time: order.delivery_end_time || 'N/A',
          is_delivery: !!parseInt(order.is_delivery),
          customer_location: order.customer_location || 'N/A',
          rider_id: order.rider_id || 'N/A',
          items: itemsStr,
        });
      }

      const fields = [
        'order_id',
        'total_price',
        'status',
        'customer_name',
        'customer_phone',
        'created_at',
        'preparation_start_time',
        'preparation_end_time',
        'delivery_start_time',
        'delivery_end_time',
        'is_delivery',
        'customer_location',
        'rider_id',
        'items',
      ];
      const json2csv = new Transform({ fields });
      res.setHeader('Content-Disposition', `attachment; filename="orders_${tenantId}_${new Date().toISOString().slice(0, 10)}.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      exportData.forEach(data => json2csv.write(data));
      json2csv.end();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};