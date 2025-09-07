const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const crypto = require('crypto');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const sanitizeFilename = require('sanitize-filename');
require('dotenv').config();

const orderRoutes = require('./orders');

// Initialize logger with sensitive data masking
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format((info) => {
      // Mask sensitive fields
      if (info.username) {
        info.username = '****';
      }
      if (info.customerPhone) {
        info.customerPhone = '****';
      }
      return info;
    })(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Environment variable validation
const requiredEnvVars = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
const PORT = process.env.PORT || 5000;
const WS_PORT = process.env.WS_PORT || 8080;
const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [
  "https://react-app-ten-black.vercel.app", // your Vercel frontend
  "http://localhost:3000"                   // local dev
];
if (allowedOrigins.length === 0) {
  logger.error('No CORS origins configured. Server will not start.');
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('CORS request rejected:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Serve static files (logos)
const uploadsDir = path.join(__dirname, 'Uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/Uploads', express.static(uploadsDir));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Validate tenantId to prevent traversal or invalid characters
    const safeTenantId = req.params.tenantId.replace(/[^a-zA-Z0-9-]/g, '');
    if (!safeTenantId) {
      return cb(new Error('Invalid tenant ID'));
    }
    const sanitizedName = sanitizeFilename(`${safeTenantId}-${Date.now()}${ext}`);
    cb(null, sanitizedName);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only .jpg, .jpeg, .png files are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// MySQL connection
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  connectionLimit: process.env.DB_CONNECTION_LIMIT || 10,
  queueLimit: 0
});

// WebSocket server setup
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Map(); // For staff: tenantId -> Set<ws>
const orderClients = new Map(); // For customers: orderId -> Set<ws>

// In-memory rate limiter for WebSocket connections
const wsRateLimitMap = new Map();
const WS_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 }; // 10 connections per 15 minutes per IP

// Phone number regex (basic validation, adjust as needed)
const phoneRegex = /^\+?\d{10,15}$/;

// Periodic cleanup of stale WebSocket connections
setInterval(() => {
  clients.forEach((clientSet, tenantId) => {
    clientSet.forEach(ws => {
      if (ws.readyState === WebSocket.CLOSED) {
        clientSet.delete(ws);
      }
    });
    if (clientSet.size === 0) {
      clients.delete(tenantId);
    }
  });
  orderClients.forEach((clientSet, orderId) => {
    clientSet.forEach(ws => {
      if (ws.readyState === WebSocket.CLOSED) {
        clientSet.delete(ws);
      }
    });
    if (clientSet.size === 0) {
      orderClients.delete(orderId);
    }
  });
}, 60000); // Run every minute

wss.on('connection', (ws, req) => {
  let tenantId, token, orderId, customerPhone;
  try {
    const url = new URL(req.url, `ws://${req.headers.host}`);
    tenantId = url.searchParams.get('tenantId');
    token = url.searchParams.get('token');
    orderId = url.searchParams.get('orderId');
    customerPhone = url.searchParams.get('customerPhone');

    // Rate-limit WebSocket connections by client IP
    const clientIp = req.socket.remoteAddress;
    const now = Date.now();
    if (!wsRateLimitMap.has(clientIp)) {
      wsRateLimitMap.set(clientIp, { count: 0, resetTime: now + WS_RATE_LIMIT.windowMs });
    }
    const rateLimitData = wsRateLimitMap.get(clientIp);
    if (now > rateLimitData.resetTime) {
      rateLimitData.count = 0;
      rateLimitData.resetTime = now + WS_RATE_LIMIT.windowMs;
    }
    if (rateLimitData.count >= WS_RATE_LIMIT.max) {
      logger.error('WebSocket connection rejected: Rate limit exceeded', { clientIp });
      ws.close(1008, 'Too many connection attempts');
      return;
    }
    rateLimitData.count++;

    // Validate customer phone format
    if (customerPhone && !phoneRegex.test(customerPhone)) {
      logger.error('WebSocket connection rejected: Invalid phone format', { tenantId, orderId });
      ws.close(1008, 'Invalid phone format');
      return;
    }
  } catch (error) {
    logger.error('WebSocket connection rejected: Invalid URL', { error: error.message });
    ws.close(1008, 'Invalid URL');
    return;
  }

  if (token) {
    // Staff connection logic
    if (!tenantId) {
      logger.error('WebSocket connection rejected: Missing tenantId');
      ws.close(1008, 'Tenant ID required');
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.tenantId !== tenantId || !['manager', 'kitchen', 'rider'].includes(decoded.role)) {
        logger.error('WebSocket connection rejected: Unauthorized', { tenantId, role: decoded.role });
        ws.close(1008, 'Unauthorized');
        return;
      }

      if (!clients.has(tenantId)) {
        clients.set(tenantId, new Set());
      }
      clients.get(tenantId).add(ws);

      ws.on('close', () => {
        clients.get(tenantId)?.delete(ws);
        if (clients.get(tenantId)?.size === 0) {
          clients.delete(tenantId);
        }
      });

      ws.on('error', (error) => {
        logger.error('WebSocket staff error:', { tenantId, error: error.message });
      });
    } catch (error) {
      logger.error('WebSocket connection rejected: Invalid token', { error: error.message });
      ws.close(1008, 'Invalid token');
    }
  } else if (tenantId && orderId && customerPhone) {
    // Public customer connection logic
    (async () => {
      try {
        const [orders] = await pool.query(
          'SELECT order_id FROM orders WHERE order_id = ? AND tenant_id = ? AND customer_phone = ?',
          [orderId, tenantId, customerPhone]
        );
        if (orders.length === 0) {
          logger.error('WebSocket public connection rejected: Invalid order or phone', { tenantId, orderId });
          ws.close(1008, 'Invalid order or phone');
          return;
        }

        const fullOrderId = orders[0].order_id;

        if (!orderClients.has(fullOrderId)) {
          orderClients.set(fullOrderId, new Set());
        }
        orderClients.get(fullOrderId).add(ws);

        ws.on('close', () => {
          orderClients.get(fullOrderId)?.delete(ws);
          if (orderClients.get(fullOrderId)?.size === 0) {
            orderClients.delete(fullOrderId);
          }
        });

        ws.on('error', (error) => {
          logger.error('WebSocket public error:', { tenantId, orderId, error: error.message });
        });
      } catch (error) {
        logger.error('Error verifying public WebSocket:', { error: error.message });
        ws.close(1008, 'Server error');
      }
    })();
  } else {
    logger.error('WebSocket connection rejected: Missing parameters');
    ws.close(1008, 'Tenant ID, and either token or (orderId and customerPhone) required');
  }
});

const broadcastOrderNotification = async (tenantId, order, messageType = 'new_order') => {
  try {
    const [rows] = await pool.query('SELECT item_id, name, price FROM menu_items WHERE tenant_id = ?', [tenantId]);
    const menuItems = new Map(rows.map(item => [item.item_id, { name: item.name, price: parseFloat(item.price) }]));

    const orderDetails = order.items.map(item => ({
      item_id: item.item_id,
      name: menuItems.get(item.item_id)?.name || item.name || 'Unknown Item',
      quantity: item.quantity,
      price: menuItems.get(item.item_id)?.price || parseFloat(item.price),
    }));

    const message = JSON.stringify({
      type: messageType,
      order: {
        order_id: order.order_id,
        items: orderDetails,
        total_price: parseFloat(order.total_price),
        status: order.status,
        customer_name: order.customer_name || 'N/A',
        customer_phone: order.customer_phone || 'N/A',
        preparation_start_time: order.preparation_start_time || null,
        preparation_end_time: order.preparation_end_time || null,
        delivery_start_time: order.delivery_start_time || null,
        delivery_end_time: order.delivery_end_time || null,
        is_delivery: order.is_delivery,
        customer_location: order.customer_location || null,
        rider_id: order.rider_id || null,
      },
    });

    // Send to staff
    if (clients.has(tenantId)) {
      clients.get(tenantId).forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }

    // Send to customer(s) for this order
    if (orderClients.has(order.order_id)) {
      orderClients.get(order.order_id).forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  } catch (error) {
    logger.error('Error broadcasting order notification:', { error: error.message, tenantId, orderId: order.order_id });
  }
};

// Middleware to verify JWT
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    logger.error('Authentication failed: No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('JWT verification error:', { error: error.message });
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Middleware to restrict to managers
const restrictToManager = (req, res, next) => {
  if (req.user.role !== 'manager') {
    logger.error('Access denied: Manager role required', { user: req.user });
    return res.status(403).json({ error: 'Manager access required' });
  }
  next();
};

// Middleware to restrict to superadmin
const restrictToSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    logger.error('Access denied: Superadmin role required', { user: req.user });
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
};

// Middleware to restrict to managers or kitchen staff
const restrictToManagerOrKitchen = (req, res, next) => {
  if (!['manager', 'kitchen'].includes(req.user.role)) {
    logger.error('Access denied: Manager or kitchen role required', { user: req.user });
    return res.status(403).json({ error: 'Manager or kitchen access required' });
  }
  next();
};

// Middleware to restrict to riders
const restrictToRider = (req, res, next) => {
  if (req.user.role !== 'rider') {
    logger.error('Access denied: Rider role required', { user: req.user });
    return res.status(403).json({ error: 'Rider access required' });
  }
  next();
};

// Middleware to restrict to managers, kitchen, or authorized riders
const restrictToManagerKitchenOrRider = async (req, res, next) => {
  const { tenantId, orderId } = req.params;
  const { status } = req.body;

  if (!['manager', 'kitchen', 'rider'].includes(req.user.role)) {
    logger.error('Access denied: Manager, kitchen, or rider role required', { user: req.user });
    return res.status(403).json({ error: 'Manager, kitchen, or rider access required' });
  }

  if (req.user.role === 'rider') {
    try {
      const [orders] = await pool.query(
        'SELECT rider_id, status FROM orders WHERE order_id = ? AND tenant_id = ?',
        [orderId, tenantId]
      );
      if (orders.length === 0) {
        logger.error('Order not found:', { tenantId, orderId });
        return res.status(404).json({ error: 'Order not found' });
      }
      const order = orders[0];

      // Allow riders to update to 'enroute' for unassigned 'completed' orders or their own orders
      if (status === 'enroute' && order.status === 'completed' && (!order.rider_id || order.rider_id === req.user.userId)) {
        return next();
      }
      // Allow riders to update to 'delivered' for orders they are assigned to
      if (status === 'delivered' && order.status === 'enroute' && order.rider_id === req.user.userId) {
        return next();
      }
      logger.error('Access denied: Rider not authorized for this action', {
        tenantId,
        orderId,
        userId: req.user.userId,
        currentStatus: order.status,
        requestedStatus: status,
        riderId: order.rider_id,
      });
      return res.status(403).json({ error: 'Rider not authorized to update this order' });
    } catch (error) {
      logger.error('Error checking rider permissions:', { error: error.message, tenantId, orderId });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Allow managers and kitchen staff to proceed
  next();
};

// Rate limit for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts, please try again later'
});

// Rate limiter for public endpoints
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP
  message: 'Too many requests from this IP, please try again later'
});

// Middleware to validate tenantId format
const validateTenantId = (req, res, next) => {
  const { tenantId } = req.params;
  if (tenantId && !/^[a-zA-Z0-9-]{1,36}$/.test(tenantId)) {
    logger.error('Invalid tenant ID format:', { tenantId });
    return res.status(400).json({ error: 'Invalid tenant ID' });
  }
  next();
};

// Apply to all routes with tenantId
app.use('/api/tenants/:tenantId', validateTenantId);

// Login endpoint
app.post('/api/login', loginLimiter, async (req, res) => {
  let { tenantId, username, password } = req.body;
  try {
    // Check if tenant is blocked when tenantId is provided
    if (tenantId) {
      const [tenants] = await pool.query('SELECT tenant_id, blocked FROM tenants WHERE tenant_id = ?', [tenantId]);
      if (tenants.length === 0) {
        logger.error('Login failed: Tenant not found', { tenantId });
        return res.status(404).json({ error: 'Tenant not found' });
      }
      const tenant = tenants[0];
      if (tenant.blocked === 1) {
        logger.error('Login failed: Tenant is blocked', { tenantId });
        return res.status(403).json({ error: 'Your Account Is Suspended By SuperAdmin So Please Contact The Administration.' });
      }
    }

    // Query user based on tenantId and username
    let users;
    if (tenantId) {
      [users] = await pool.query('SELECT user_id, tenant_id, username, password, role FROM users WHERE tenant_id = ? AND username = ?', [tenantId, username]);
    } else {
      [users] = await pool.query('SELECT user_id, tenant_id, username, password, role FROM users WHERE tenant_id IS NULL AND username = ?', [username]);
    }

    if (users.length === 0) {
      logger.error('Login failed: User not found', { tenantId });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.error('Login failed: Incorrect password', { tenantId });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id, tenantId: user.tenant_id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token, role: user.role, userId: user.user_id });
  } catch (error) {
    logger.error('Login error:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Superadmin: List all tenants
app.get('/api/tenants', authenticateToken, restrictToSuperAdmin, async (req, res) => {
  try {
    const [tenants] = await pool.query('SELECT tenant_id, name, logo_url, primary_color, blocked, created_at FROM tenants');
    res.json(tenants);
  } catch (error) {
    logger.error('Error fetching tenants:', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Superadmin: Create new tenant
app.post('/api/tenants', authenticateToken, restrictToSuperAdmin, async (req, res) => {
  const { name, managerUsername, managerPassword } = req.body;
  if (!name || !managerUsername || !managerPassword) {
    return res.status(400).json({ error: 'Name, manager username, and password are required' });
  }

  const tenantId = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash(managerPassword, SALT_ROUNDS);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'INSERT INTO tenants (tenant_id, name) VALUES (?, ?)',
      [tenantId, name]
    );
    await connection.query(
      'INSERT INTO users (tenant_id, username, password, role) VALUES (?, ?, ?, ?)',
      [tenantId, managerUsername, hashedPassword, 'manager']
    );
    await connection.commit();
    res.json({ success: true, tenantId });
  } catch (error) {
    await connection.rollback();
    logger.error('Error creating tenant:', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
});

// Superadmin: Block/Unblock tenant
app.put('/api/tenants/:tenantId/block', authenticateToken, restrictToSuperAdmin, async (req, res) => {
  const { tenantId } = req.params;
  const { blocked } = req.body;
  if (typeof blocked !== 'boolean') {
    return res.status(400).json({ error: 'Blocked must be a boolean' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE tenants SET blocked = ? WHERE tenant_id = ?',
      [blocked ? 1 : 0, tenantId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating tenant block status:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tenant details
app.get('/api/tenants/:tenantId', authenticateToken, async (req, res) => {
  const { tenantId } = req.params;
  if (req.user.tenantId !== tenantId) {
    logger.error('Unauthorized tenant access:', { tenantId, user: req.user });
    return res.status(403).json({ error: 'Unauthorized tenant' });
  }

  try {
    const [tenants] = await pool.query('SELECT name, logo_url, primary_color FROM tenants WHERE tenant_id = ?', [tenantId]);
    if (tenants.length === 0) {
      logger.error('Tenant not found:', { tenantId });
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json(tenants[0]);
  } catch (error) {
    logger.error('Error fetching tenant:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tenant details (public)
app.get('/api/tenants/:tenantId/public', publicLimiter, async (req, res) => {
  const { tenantId } = req.params;
  try {
    const [tenants] = await pool.query('SELECT name, logo_url, primary_color FROM tenants WHERE tenant_id = ?', [tenantId]);
    if (tenants.length === 0) {
      logger.error('Tenant not found:', { tenantId });
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json(tenants[0]);
  } catch (error) {
    logger.error('Error fetching public tenant:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available riders
app.get('/api/tenants/:tenantId/riders', authenticateToken, restrictToManagerOrKitchen, async (req, res) => {
  const { tenantId } = req.params;
  if (req.user.tenantId !== tenantId) {
    logger.error('Unauthorized tenant access:', { tenantId, user: req.user });
    return res.status(403).json({ error: 'Unauthorized tenant' });
  }

  try {
    const [riders] = await pool.query(
      'SELECT u.user_id, u.username, COUNT(o.order_id) as active_orders ' +
      'FROM users u ' +
      'LEFT JOIN orders o ON u.user_id = o.rider_id AND o.tenant_id = ? AND o.status = ? ' +
      'WHERE u.tenant_id = ? AND u.role = ? ' +
      'GROUP BY u.user_id, u.username',
      [tenantId, 'enroute', tenantId, 'rider']
    );
    const formattedRiders = riders.map(rider => ({
      user_id: parseInt(rider.user_id),
      username: rider.username,
      is_available: rider.active_orders === 0,
    }));
    res.json(formattedRiders);
  } catch (error) {
    logger.error('Error fetching riders:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get menu items (authenticated)
app.get('/api/tenants/:tenantId/menu-items', authenticateToken, async (req, res) => {
  const { tenantId } = req.params;
  if (req.user.tenantId !== tenantId) {
    logger.error('Unauthorized tenant access:', { tenantId, user: req.user });
    return res.status(403).json({ error: 'Unauthorized tenant' });
  }

  try {
    const [items] = await pool.query(
      'SELECT item_id, name, category, price, stock_quantity, low_stock_threshold, created_at FROM menu_items WHERE tenant_id = ?',
      [tenantId]
    );
    const formattedItems = items.map(item => ({
      item_id: parseInt(item.item_id),
      name: item.name,
      category: item.category,
      price: parseFloat(item.price),
      stock_quantity: parseInt(item.stock_quantity),
      low_stock_threshold: parseInt(item.low_stock_threshold),
      created_at: item.created_at,
    }));
    res.json(formattedItems);
  } catch (error) {
    logger.error('Error fetching menu items:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get menu items (public)
app.get('/api/tenants/:tenantId/public/menu', publicLimiter, async (req, res) => {
  const { tenantId } = req.params;
  try {
    const [items] = await pool.query(
      'SELECT item_id, name, category, price, stock_quantity FROM menu_items WHERE tenant_id = ?',
      [tenantId]
    );
    const formattedItems = items.map(item => ({
      item_id: parseInt(item.item_id),
      name: item.name,
      category: item.category,
      price: parseFloat(item.price),
      stock_quantity: parseInt(item.stock_quantity),
    }));
    res.json(formattedItems);
  } catch (error) {
    logger.error('Error fetching public menu:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Input validation for menu items
const Joi = require('joi');
const menuItemSchema = Joi.object({
  name: Joi.string().required(),
  category: Joi.string().required(),
  price: Joi.number().min(0).required(),
  stock_quantity: Joi.number().integer().min(0).optional(),
  low_stock_threshold: Joi.number().integer().min(0).optional()
});

// Create menu item (manager only)
app.post('/api/tenants/:tenantId/menu-items', authenticateToken, restrictToManager, async (req, res) => {
  const { tenantId } = req.params;
  const { error: validationError } = menuItemSchema.validate(req.body);
  if (validationError) {
    logger.error('Invalid menu item data:', { tenantId, error: validationError.message });
    return res.status(400).json({ error: validationError.message });
  }
  const { name, category, price, stock_quantity, low_stock_threshold } = req.body;
  if (req.user.tenantId !== tenantId) {
    logger.error('Unauthorized tenant access:', { tenantId, user: req.user });
    return res.status(403).json({ error: 'Unauthorized tenant' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO menu_items (tenant_id, name, category, price, stock_quantity, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?)',
      [tenantId, name, category, parseFloat(price), parseInt(stock_quantity || 0), parseInt(low_stock_threshold || 5)]
    );
    res.json({ success: true, itemId: result.insertId });
  } catch (error) {
    logger.error('Error creating menu item:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update menu item (manager only)
app.put('/api/tenants/:tenantId/menu-items/:itemId', authenticateToken, restrictToManager, async (req, res) => {
  const { tenantId, itemId } = req.params;
  const { error: validationError } = menuItemSchema.validate(req.body);
  if (validationError) {
    logger.error('Invalid menu item data:', { tenantId, itemId, error: validationError.message });
    return res.status(400).json({ error: validationError.message });
  }
  const { name, category, price, stock_quantity, low_stock_threshold } = req.body;
  if (req.user.tenantId !== tenantId) {
    logger.error('Unauthorized tenant access:', { tenantId, user: req.user });
    return res.status(403).json({ error: 'Unauthorized tenant' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE menu_items SET name = ?, category = ?, price = ?, stock_quantity = ?, low_stock_threshold = ? WHERE item_id = ? AND tenant_id = ?',
      [name, category, parseFloat(price), parseInt(stock_quantity || 0), parseInt(low_stock_threshold || 5), parseInt(itemId), tenantId]
    );
    if (result.affectedRows === 0) {
      logger.error('Menu item not found or unauthorized:', { tenantId, itemId });
      return res.status(404).json({ error: 'Menu item not found or not authorized' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating menu item:', { error: error.message, tenantId, itemId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete menu item (manager only)
app.delete('/api/tenants/:tenantId/menu-items/:itemId', authenticateToken, restrictToManager, async (req, res) => {
  const { tenantId, itemId } = req.params;
  if (req.user.tenantId !== tenantId) {
    logger.error('Unauthorized tenant access:', { tenantId, user: req.user });
    return res.status(403).json({ error: 'Unauthorized tenant' });
  }

  try {
    const [result] = await pool.query(
      'DELETE FROM menu_items WHERE item_id = ? AND tenant_id = ?',
      [parseInt(itemId), tenantId]
    );
    if (result.affectedRows === 0) {
      logger.error('Menu item not found or unauthorized:', { tenantId, itemId });
      return res.status(404).json({ error: 'Menu item not found or not authorized' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting menu item:', { error: error.message, tenantId, itemId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Restock menu item (manager only)
app.patch('/api/tenants/:tenantId/menu-items/:itemId/restock', authenticateToken, restrictToManager, async (req, res) => {
  const { tenantId, itemId } = req.params;
  const { quantity } = req.body;
  if (req.user.tenantId !== tenantId) {
    logger.error('Unauthorized tenant access:', { tenantId, user: req.user });
    return res.status(403).json({ error: 'Unauthorized tenant' });
  }
  if (!quantity || quantity < 0) {
    logger.error('Invalid restock quantity:', { tenantId, itemId, quantity });
    return res.status(400).json({ error: 'Invalid restock quantity' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE menu_items SET stock_quantity = stock_quantity + ? WHERE item_id = ? AND tenant_id = ?',
      [parseInt(quantity), parseInt(itemId), tenantId]
    );
    if (result.affectedRows === 0) {
      logger.error('Menu item not found or unauthorized:', { tenantId, itemId });
      return res.status(404).json({ error: 'Menu item not found or not authorized' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error restocking menu item:', { error: error.message, tenantId, itemId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update tenant settings
app.put('/api/tenants/:tenantId', authenticateToken, restrictToManager, upload.single('logo'), async (req, res) => {
  const { tenantId } = req.params;
  const { name, primary_color } = req.body;
  if (req.user.tenantId !== tenantId) {
    logger.error('Unauthorized tenant access:', { tenantId, user: req.user });
    return res.status(403).json({ error: 'Unauthorized tenant' });
  }

  try {
    let logo_url = req.body.logo_url;
    if (req.file) {
      logo_url = `/Uploads/${req.file.filename}`;
    }

    const [result] = await pool.query(
      'UPDATE tenants SET name = ?, logo_url = ?, primary_color = ? WHERE tenant_id = ?',
      [name || 'Default Tenant', logo_url || null, primary_color || '#1976d2', tenantId]
    );
    if (result.affectedRows === 0) {
      logger.error('Tenant not found:', { tenantId });
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating tenant:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order history
app.get('/api/tenants/:tenantId/order-history', authenticateToken, restrictToManager, async (req, res) => {
  const { tenantId } = req.params;
  if (req.user.tenantId !== tenantId) {
    logger.error('Unauthorized tenant access:', { tenantId, user: req.user });
    return res.status(403).json({ error: 'Unauthorized tenant' });
  }

  try {
    const [history] = await pool.query(
      'SELECT history_id, order_id, action, details, changed_by, change_timestamp FROM order_history WHERE tenant_id = ? ORDER BY change_timestamp DESC',
      [tenantId]
    );
    const formattedHistory = history.map(h => {
      let parsedDetails = { items: [] };
      if (h.details) {
        try {
          // Validate JSON structure
          const details = JSON.parse(h.details);
          if (typeof details !== 'object' || details === null || !Array.isArray(details.items)) {
            throw new Error('Invalid details format');
          }
          parsedDetails = details;
        } catch (error) {
          logger.error('Error parsing order history details:', { history_id: h.history_id, error: error.message });
          parsedDetails = { items: [], error: 'Invalid JSON' };
        }
      }
      return {
        history_id: h.history_id,
        order_id: parseInt(h.order_id),
        action: h.action,
        details: parsedDetails,
        changed_by: h.changed_by,
        change_timestamp: h.change_timestamp,
      };
    });
    res.json(formattedHistory);
  } catch (error) {
    logger.error('Error fetching order history:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get analytics
app.get('/api/tenants/:tenantId/analytics', authenticateToken, restrictToManager, async (req, res) => {
  const { tenantId } = req.params;
  if (req.user.tenantId !== tenantId) {
    logger.error('Unauthorized tenant access:', { tenantId, user: req.user });
    return res.status(403).json({ error: 'Unauthorized tenant' });
  }

  try {
    const [orderStats] = await pool.query(
      'SELECT COUNT(DISTINCT o.order_id) as totalOrders, SUM(oi.quantity * oi.price) as totalRevenue ' +
      'FROM orders o JOIN order_items oi ON o.order_id = oi.order_id WHERE o.tenant_id = ? AND o.status != ?',
      [tenantId, 'canceled']
    );
    const [lowStockItems] = await pool.query(
      'SELECT item_id, name, stock_quantity, low_stock_threshold FROM menu_items WHERE tenant_id = ? AND stock_quantity <= low_stock_threshold',
      [tenantId]
    );
    res.json({
      totalOrders: parseInt(orderStats[0].totalOrders) || 0,
      totalRevenue: parseFloat(orderStats[0].totalRevenue) || 0,
      lowStockItems: lowStockItems.map(item => ({
        item_id: parseInt(item.item_id),
        name: item.name,
        stock_quantity: parseInt(item.stock_quantity),
        low_stock_threshold: parseInt(item.low_stock_threshold),
      })),
    });
  } catch (error) {
    logger.error('Error fetching analytics:', { error: error.message, tenantId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    logger.error('Health check failed:', { error: error.message });
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Use order routes
app.use('/api/tenants/:tenantId', orderRoutes({
  pool,
  authenticateToken,
  restrictToManager,
  restrictToManagerKitchenOrRider,
  broadcastOrderNotification,
  logger,
  rateLimit
}));

// Centralized error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { error: err.message, path: req.path });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));