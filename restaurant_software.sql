SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `railway`
--
USE railway;

-- --------------------------------------------------------

--
-- Table structure for table `tenants`
--

CREATE TABLE IF NOT EXISTS `tenants` (
  `tenant_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `primary_color` varchar(7) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `blocked` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tenants`
--

INSERT INTO `tenants` (`tenant_id`, `name`, `logo_url`, `primary_color`, `created_at`, `blocked`) VALUES
('c7e02edb-bbb9-4579-bb99-c2fd4d827b70', 'Arabian Shawarma', NULL, NULL, '2025-08-24 23:43:47', 0),
('ddc94e5a-e566-47a3-9c81-d52690c70f09', 'Cheezious', NULL, NULL, '2025-08-28 18:31:46', 0),
('tenant-1', 'Dogar Foods & Sajji Corner', '/Uploads/tenant-1-1756381795089.jpg', '#0029ff', '2025-08-23 11:50:21', 0);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE IF NOT EXISTS `users` (
  `user_id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) DEFAULT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('manager','kitchen','staff','rider','superadmin') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`username`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`user_id`, `tenant_id`, `username`, `password`, `role`, `created_at`) VALUES
(1, 'tenant-1', 'admin', '$2b$10$dtDqXmOOqtD/OPDC94ONt.2cCVC/g4SvhXqfHh5EuOPfvBczkwyta', 'manager', '2025-08-23 11:50:21'),
(2, 'tenant-1', 'customer', 'N/A', 'staff', '2025-08-23 17:18:36'),
(3, 'tenant-1', 'rider', '$2b$10$dtDqXmOOqtD/OPDC94ONt.2cCVC/g4SvhXqfHh5EuOPfvBczkwyta', 'rider', '2025-08-24 15:16:13'),
(4, 'tenant-1', 'kitchen', '$2b$10$dtDqXmOOqtD/OPDC94ONt.2cCVC/g4SvhXqfHh5EuOPfvBczkwyta', 'kitchen', '2025-08-24 22:04:37'),
(5, NULL, 'superadmin', '$2b$10$dtDqXmOOqtD/OPDC94ONt.2cCVC/g4SvhXqfHh5EuOPfvBczkwyta', 'superadmin', '2025-08-24 22:46:03'),
(7, 'c7e02edb-bbb9-4579-bb99-c2fd4d827b70', 'arabian', '$2b$10$E1U/0vpu/tTI.yJtUWR8/OHz0j5TyJPgHplv.iNBS8RZC3EOHmbeS', 'manager', '2025-08-24 23:43:47'),
(8, 'tenant-1', 'rider2', '$2b$10$dtDqXmOOqtD/OPDC94ONt.2cCVC/g4SvhXqfHh5EuOPfvBczkwyta', 'rider', '2025-08-25 23:17:51'),
(9, 'ddc94e5a-e566-47a3-9c81-d52690c70f09', 'cheezy', '$2b$10$w3g//P/1VMTkQKwjwQ4Cv.xEGJfHjK88aqhFJkT94Fvv/D28EMWL2', 'manager', '2025-08-28 18:31:46');

-- --------------------------------------------------------

--
-- Table structure for table `menu_items`
--

CREATE TABLE IF NOT EXISTS `menu_items` (
  `item_id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `category` varchar(50) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `stock_quantity` int(11) NOT NULL DEFAULT 0,
  `low_stock_threshold` int(11) NOT NULL DEFAULT 5,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `image_url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`item_id`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`name`),
  KEY `idx_menu_items_tenant` (`tenant_id`),
  CONSTRAINT `menu_items_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `menu_items`
--

INSERT INTO `menu_items` (`item_id`, `tenant_id`, `name`, `category`, `price`, `stock_quantity`, `low_stock_threshold`, `created_at`, `image_url`) VALUES
(7, 'tenant-1', 'Zinger Burger', 'Food', 100.00, 153, 5, '2025-08-28 17:53:30', NULL),
(8, 'tenant-1', 'Shawarma', 'Food', 150.00, 74, 5, '2025-08-28 18:11:47', NULL),
(10, 'tenant-1', 'Patty Burger', 'Food', 100.00, 988, 50, '2025-08-29 00:49:25', NULL),
(11, 'tenant-1', 'Chicken Burger', 'Food', 100.00, 90, 5, '2025-08-30 20:14:21', NULL),
(12, 'tenant-1', 'Salad', 'Beverage', 20.00, 1000, 5, '2025-08-30 20:22:10', NULL),
(13, 'tenant-1', 'Pizza Burger', 'Food', 100.00, 999, 5, '2025-09-01 13:28:28', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE IF NOT EXISTS `orders` (
  `order_id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `status` enum('pending','preparing','completed','assigned','enroute','delivered','canceled') NOT NULL DEFAULT 'pending',
  `total_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `customer_name` varchar(100) DEFAULT NULL,
  `customer_phone` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `preparation_start_time` datetime DEFAULT NULL,
  `preparation_end_time` datetime DEFAULT NULL,
  `is_delivery` tinyint(1) NOT NULL DEFAULT 0,
  `customer_location` varchar(255) DEFAULT NULL,
  `rider_id` int(11) DEFAULT NULL,
  `delivery_start_time` datetime DEFAULT NULL,
  `delivery_end_time` datetime DEFAULT NULL,
  PRIMARY KEY (`order_id`),
  KEY `idx_orders_tenant_status` (`tenant_id`,`status`),
  KEY `rider_id` (`rider_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`) ON DELETE CASCADE,
  CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`rider_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`order_id`, `tenant_id`, `status`, `total_price`, `customer_name`, `customer_phone`, `created_at`, `preparation_start_time`, `preparation_end_time`, `is_delivery`, `customer_location`, `rider_id`, `delivery_start_time`, `delivery_end_time`) VALUES
(125, 'tenant-1', 'completed', 300.00, 'Rayan', '03004576908', '2025-09-01 14:26:02', '2025-09-03 17:21:21', '2025-09-03 17:21:25', 0, NULL, NULL, NULL, NULL),
(126, 'tenant-1', 'canceled', 500.00, 'Abdullah', '03269746020', '2025-09-01 14:32:11', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(127, 'tenant-1', 'completed', 300.00, 'Hassan Ali', '03020392982', '2025-09-01 17:05:59', NULL, '2025-09-01 17:54:44', 0, NULL, NULL, NULL, NULL),
(128, 'tenant-1', 'canceled', 100.00, 'Abdullah Malik', '03045676466', '2025-09-01 17:52:59', '2025-09-03 17:13:30', NULL, 0, NULL, NULL, NULL, NULL),
(129, 'tenant-1', 'delivered', 100.00, 'Ali', '09090908978686', '2025-09-01 18:40:20', '2025-09-03 17:01:18', '2025-09-03 17:01:58', 1, 'https://www.google.com/maps?q=31.585241,74.345039', 3, '2025-09-03 17:22:01', '2025-09-03 17:22:20'),
(130, 'tenant-1', 'delivered', 100.00, 'Abdullah', '979786757645', '2025-09-03 15:12:26', '2025-09-03 15:13:02', '2025-09-03 15:13:40', 1, 'https://www.google.com/maps?q=31.5203915,74.3183745', 3, '2025-09-03 15:13:57', '2025-09-03 15:14:13'),
(131, 'tenant-1', 'completed', 550.00, 'Ali', '0347890789', '2025-09-03 22:17:37', '2025-09-03 23:15:39', '2025-09-04 16:35:49', 0, NULL, NULL, NULL, NULL),
(132, 'tenant-1', 'delivered', 600.00, 'Ali', '08978575647874', '2025-09-04 16:36:49', '2025-09-04 16:37:03', '2025-09-04 16:37:27', 1, 'Lahore', 3, '2025-09-04 16:37:42', '2025-09-04 16:38:35'),
(133, 'tenant-1', 'completed', 100.00, 'ali', '87868585687', '2025-09-05 22:58:23', '2025-09-05 23:00:19', '2025-09-05 23:00:29', 0, NULL, NULL, NULL, NULL),
(134, 'tenant-1', 'pending', 750.00, 'Ali', '98978686768', '2025-09-05 22:59:35', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(135, 'tenant-1', 'pending', 750.00, 'Abdullah', '98797868675', '2025-09-05 23:01:06', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(136, 'tenant-1', 'delivered', 150.00, 'Abdullah', '9797976868', '2025-09-05 23:01:43', '2025-09-05 23:02:06', '2025-09-05 23:02:09', 1, 'https://www.google.com/maps?q=31.58520921800018,74.34497955670102', NULL, '2025-09-05 23:02:12', '2025-09-05 23:02:18'),
(137, 'tenant-1', 'delivered', 100.00, 'Abdullah Malik', '97978675768', '2025-09-05 23:36:02', '2025-09-05 23:36:13', '2025-09-05 23:36:16', 0, NULL, NULL, '2025-09-05 23:36:19', '2025-09-05 23:36:22'),
(138, 'tenant-1', 'pending', 100.00, 'Ali', '98989897867576', '2025-09-05 23:51:26', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(139, 'tenant-1', 'pending', 100.00, 'Fiza', '97978686868', '2025-09-06 00:01:03', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(140, 'tenant-1', 'pending', 100.00, 'Farhan Ali', '99989898989', '2025-09-06 00:10:40', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(141, 'tenant-1', 'pending', 100.00, 'Faiza', '98989898998', '2025-09-06 00:14:03', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(142, 'tenant-1', 'pending', 100.00, 'Fizza', '989898989898', '2025-09-06 00:21:15', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(143, 'tenant-1', 'pending', 300.00, 'Faiza Ali', '9898988787878', '2025-09-06 00:23:12', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(144, 'tenant-1', 'canceled', 100.00, 'Faiza Gujjar', '98978786868', '2025-09-06 00:29:03', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(145, 'tenant-1', 'canceled', 100.00, 'Hassan Abdullah', '090898786687', '2025-09-06 19:25:10', NULL, NULL, 0, NULL, NULL, NULL, NULL),
(146, 'tenant-1', 'pending', 100.00, 'Ali Hassan', '989786868679', '2025-09-06 20:04:12', NULL, NULL, 0, NULL, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--

CREATE TABLE IF NOT EXISTS `order_items` (
  `order_item_id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `item_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`order_item_id`),
  KEY `idx_order_items_order` (`order_id`),
  KEY `idx_order_items_item` (`item_id`),
  KEY `order_items_ibfk_3` (`tenant_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`item_id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_ibfk_3` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `order_items`
--

INSERT INTO `order_items` (`order_item_id`, `order_id`, `tenant_id`, `item_id`, `quantity`, `price`, `name`) VALUES
(356, 126, 'tenant-1', 11, 5, 100.00, 'Chicken Burger'),
(359, 127, 'tenant-1', 8, 2, 150.00, 'Shawarma'),
(365, 130, 'tenant-1', 7, 1, 100.00, 'Zinger Burger'),
(368, 128, 'tenant-1', 10, 1, 100.00, 'Patty Burger'),
(371, 125, 'tenant-1', 7, 3, 100.00, 'Zinger Burger'),
(373, 129, 'tenant-1', 7, 1, 100.00, 'Zinger Burger'),
(379, 131, 'tenant-1', 8, 3, 150.00, 'Shawarma'),
(380, 131, 'tenant-1', 11, 1, 100.00, 'Chicken Burger'),
(385, 132, 'tenant-1', 8, 4, 150.00, 'Shawarma'),
(387, 134, 'tenant-1', 8, 5, 150.00, 'Shawarma'),
(389, 133, 'tenant-1', 7, 1, 100.00, 'Zinger Burger'),
(390, 135, 'tenant-1', 7, 1, 100.00, 'Zinger Burger'),
(391, 135, 'tenant-1', 8, 1, 150.00, 'Shawarma'),
(392, 135, 'tenant-1', 10, 5, 100.00, 'Patty Burger'),
(397, 136, 'tenant-1', 8, 1, 150.00, 'Shawarma'),
(402, 137, 'tenant-1', 11, 1, 100.00, 'Chicken Burger'),
(403, 138, 'tenant-1', 7, 1, 100.00, 'Zinger Burger'),
(404, 139, 'tenant-1', 11, 1, 100.00, 'Chicken Burger'),
(405, 140, 'tenant-1', 7, 1, 100.00, 'Zinger Burger'),
(406, 141, 'tenant-1', 7, 1, 100.00, 'Zinger Burger'),
(407, 142, 'tenant-1', 7, 1, 100.00, 'Zinger Burger'),
(408, 143, 'tenant-1', 7, 1, 100.00, 'Zinger Burger'),
(409, 143, 'tenant-1', 11, 1, 100.00, 'Chicken Burger'),
(410, 143, 'tenant-1', 10, 1, 100.00, 'Patty Burger'),
(411, 144, 'tenant-1', 11, 1, 100.00, 'Chicken Burger'),
(412, 145, 'tenant-1', 7, 1, 100.00, 'Zinger Burger'),
(413, 146, 'tenant-1', 10, 1, 100.00, 'Patty Burger');

-- --------------------------------------------------------

--
-- Table structure for table `order_history`
--

CREATE TABLE IF NOT EXISTS `order_history` (
  `history_id` varchar(36) NOT NULL,
  `order_id` int(11) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `action` enum('created','updated','canceled') NOT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `changed_by` varchar(50) NOT NULL,
  `change_timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`history_id`),
  KEY `order_id` (`order_id`),
  KEY `tenant_id` (`tenant_id`,`changed_by`),
  KEY `idx_order_history_tenant` (`tenant_id`),
  CONSTRAINT `order_history_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`) ON DELETE CASCADE,
  CONSTRAINT `order_history_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `order_history_ibfk_3` FOREIGN KEY (`tenant_id`,`changed_by`) REFERENCES `users` (`tenant_id`, `username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `order_history`
--

INSERT INTO `order_history` (`history_id`, `order_id`, `tenant_id`, `action`, `details`, `changed_by`, `change_timestamp`) VALUES
('15db066d-8ab1-11f0-b70d-d0abd5528efa', 137, 'tenant-1', 'created', '{"items":[{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Abdullah Malik","customerPhone":"97978675768","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-05 23:36:02'),
('18673455-8aac-11f0-89cb-d0abd5528efa', 133, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"preparing","customerName":"ali","customerPhone":"87868585687","preparation_start_time":"2025-09-05 23:00:19","preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-05 23:00:19'),
('1c5fbeb5-8ab1-11f0-b70d-d0abd5528efa', 137, 'tenant-1', 'updated', '{"items":[{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":100,"status":"preparing","customerName":"Abdullah Malik","customerPhone":"97978675768","preparation_start_time":"2025-09-05 23:36:13","preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-05 23:36:13'),
('1cfb014d-8763-11f0-803e-d0abd5528efa', 129, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Ali","customerPhone":"09090908978686","is_delivery":1,"customer_location":"https://www.google.com/maps?q=31.585241,74.345039"}', 'customer', '2025-09-01 18:40:20'),
('1e3cbe6e-8ab1-11f0-b70d-d0abd5528efa', 137, 'tenant-1', 'updated', '{"items":[{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":100,"status":"completed","customerName":"Abdullah Malik","customerPhone":"97978675768","preparation_start_time":"2025-09-05T18:36:13.000Z","preparation_end_time":"2025-09-05 23:36:16","delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-05 23:36:16'),
('1e53c4ee-8aac-11f0-89cb-d0abd5528efa', 133, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"completed","customerName":"ali","customerPhone":"87868585687","preparation_start_time":"2025-09-05T18:00:19.000Z","preparation_end_time":"2025-09-05 23:00:29","delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-05 23:00:29'),
('1f8984c4-8ab1-11f0-b70d-d0abd5528efa', 137, 'tenant-1', 'updated', '{"items":[{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":100,"status":"enroute","customerName":"Abdullah Malik","customerPhone":"97978675768","preparation_start_time":"2025-09-05T18:36:13.000Z","preparation_end_time":"2025-09-05T18:36:16.000Z","delivery_start_time":"2025-09-05 23:36:19","delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-05 23:36:19'),
('2142323c-8ab1-11f0-b70d-d0abd5528efa', 137, 'tenant-1', 'updated', '{"items":[{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":100,"status":"delivered","customerName":"Abdullah Malik","customerPhone":"97978675768","preparation_start_time":"2025-09-05T18:36:13.000Z","preparation_end_time":"2025-09-05T18:36:16.000Z","delivery_start_time":"2025-09-05T18:36:19.000Z","delivery_end_time":"2025-09-05 23:36:22","is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-05 23:36:22'),
('345484a0-8aac-11f0-89cb-d0abd5528efa', 135, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100},{"item_id":8,"name":"Shawarma","quantity":1,"price":150},{"item_id":10,"name":"Patty Burger","quantity":5,"price":100}],"total_price":750,"status":"pending","customerName":"Abdullah","customerPhone":"98797868675","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-05 23:01:06'),
('3482e503-8b57-11f0-9374-d0abd5528efa', 145, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Hassan Abdullah","customerPhone":"090898786687","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-06 19:25:10'),
('34e1b51b-88ea-11f0-add2-d0abd5528efa', 128, 'tenant-1', 'updated', '{"items":[{"item_id":10,"name":"Patty Burger","quantity":1,"price":100}],"total_price":100,"status":"canceled","customerName":"Abdullah Malik","customerPhone":"03045676466","preparation_start_time":"2025-09-03T12:13:30.000Z","preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-03 17:19:53'),
('373fa54d-89ad-11f0-b91f-d0abd5528efa', 131, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":3,"price":150},{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":550,"status":"completed","customerName":"Ali","customerPhone":"0347890789","preparation_start_time":"2025-09-03T18:15:39.000Z","preparation_end_time":"2025-09-04 16:35:49","delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-04 16:35:49'),
('3889e29a-88ea-11f0-add2-d0abd5528efa', 126, 'tenant-1', 'updated', '{"items":[{"item_id":11,"name":"Chicken Burger","quantity":5,"price":100}],"total_price":500,"status":"canceled","customerName":"Abdullah","customerPhone":"03269746020","preparation_start_time":null,"preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-03 17:20:00'),
('3ca52c88-8ab3-11f0-b70d-d0abd5528efa', 138, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Ali","customerPhone":"98989897867576","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-05 23:51:26'),
('403e9cb3-88ea-11f0-add2-d0abd5528efa', 125, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":3,"price":100}],"total_price":300,"status":"pending","customerName":"Rayan","customerPhone":"03004576908","preparation_start_time":null,"preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'admin', '2025-09-03 17:20:12'),
('4a8f07e5-8aac-11f0-89cb-d0abd5528efa', 136, 'tenant-1', 'created', '{"items":[{"item_id":8,"name":"Shawarma","quantity":1,"price":150}],"total_price":150,"status":"pending","customerName":"Abdullah","customerPhone":"9797976868","preparation_start_time":null,"is_delivery":1,"customer_location":"https://www.google.com/maps?q=31.58520921800018,74.34497955670102","rider_id":null}', 'customer', '2025-09-05 23:01:43'),
('504a29f1-88e9-11f0-add2-d0abd5528efa', 128, 'tenant-1', 'updated', '{"items":[{"item_id":10,"name":"Patty Burger","quantity":1,"price":100}],"total_price":100,"status":"preparing","customerName":"Abdullah Malik","customerPhone":"03045676466","preparation_start_time":"2025-09-03 17:13:30","preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-03 17:13:30'),
('5814746a-8aac-11f0-89cb-d0abd5528efa', 136, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":1,"price":150}],"total_price":150,"status":"preparing","customerName":"Abdullah","customerPhone":"9797976868","preparation_start_time":"2025-09-05 23:02:06","preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":true,"customer_location":"https://www.google.com/maps?q=31.58520921800018,74.34497955670102","rider_id":null}', 'admin', '2025-09-05 23:02:06'),
('59d8358e-8aac-11f0-89cb-d0abd5528efa', 136, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":1,"price":150}],"total_price":150,"status":"completed","customerName":"Abdullah","customerPhone":"9797976868","preparation_start_time":"2025-09-05T18:02:06.000Z","preparation_end_time":"2025-09-05 23:02:09","delivery_start_time":null,"delivery_end_time":null,"is_delivery":true,"customer_location":"https://www.google.com/maps?q=31.58520921800018,74.34497955670102","rider_id":null}', 'admin', '2025-09-05 23:02:09'),
('5b0fdef4-89ad-11f0-b91f-d0abd5528efa', 132, 'tenant-1', 'created', '{"items":[{"item_id":8,"name":"Shawarma","quantity":4,"price":150}],"total_price":600,"status":"pending","customerName":"Ali","customerPhone":"08978575647874","preparation_start_time":null,"is_delivery":1,"customer_location":"Lahore","rider_id":3}', 'admin', '2025-09-04 16:36:49'),
('5b794f66-8aac-11f0-89cb-d0abd5528efa', 136, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":1,"price":150}],"total_price":150,"status":"enroute","customerName":"Abdullah","customerPhone":"9797976868","preparation_start_time":"2025-09-05T18:02:06.000Z","preparation_end_time":"2025-09-05T18:02:09.000Z","delivery_start_time":"2025-09-05 23:02:12","delivery_end_time":null,"is_delivery":true,"customer_location":"https://www.google.com/maps?q=31.58520921800018,74.34497955670102","rider_id":null}', 'admin', '2025-09-05 23:02:12'),
('5f839a93-8aac-11f0-89cb-d0abd5528efa', 136, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":1,"price":150}],"total_price":150,"status":"delivered","customerName":"Abdullah","customerPhone":"9797976868","preparation_start_time":"2025-09-05T18:02:06.000Z","preparation_end_time":"2025-09-05T18:02:09.000Z","delivery_start_time":"2025-09-05T18:02:12.000Z","delivery_end_time":"2025-09-05 23:02:18","is_delivery":true,"customer_location":"https://www.google.com/maps?q=31.58520921800018,74.34497955670102","rider_id":null}', 'admin', '2025-09-05 23:02:18'),
('635cc4a2-89ad-11f0-b91f-d0abd5528efa', 132, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":4,"price":150}],"total_price":600,"status":"preparing","customerName":"Ali","customerPhone":"08978575647874","preparation_start_time":"2025-09-04 16:37:03","preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":true,"customer_location":"Lahore","rider_id":3}', 'kitchen', '2025-09-04 16:37:03'),
('6506abd8-8ab6-11f0-b70d-d0abd5528efa', 141, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Faiza","customerPhone":"98989898998","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-06 00:14:03'),
('66a6e1d6-88d8-11f0-add2-d0abd5528efa', 130, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Abdullah","customerPhone":"979786757645","is_delivery":1,"customer_location":"https://www.google.com/maps?q=31.5203915,74.3183745"}', 'customer', '2025-09-03 15:12:26'),
('66c5a562-8ab7-11f0-b70d-d0abd5528efa', 142, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Fizza","customerPhone":"989898989898","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-06 00:21:15'),
('6928d45a-88ea-11f0-add2-d0abd5528efa', 125, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":3,"price":100}],"total_price":300,"status":"preparing","customerName":"Rayan","customerPhone":"03004576908","preparation_start_time":"2025-09-03 17:21:21","preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'kitchen', '2025-09-03 17:21:21'),
('6b77a613-88ea-11f0-add2-d0abd5528efa', 125, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":3,"price":100}],"total_price":300,"status":"completed","customerName":"Rayan","customerPhone":"03004576908","preparation_start_time":"2025-09-03T12:21:21.000Z","preparation_end_time":"2025-09-03 17:21:25","delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'kitchen', '2025-09-03 17:21:25'),
('71be8818-89ad-11f0-b91f-d0abd5528efa', 132, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":4,"price":150}],"total_price":600,"status":"completed","customerName":"Ali","customerPhone":"08978575647874","preparation_start_time":"2025-09-04T11:37:03.000Z","preparation_end_time":"2025-09-04 16:37:27","delivery_start_time":null,"delivery_end_time":null,"is_delivery":true,"customer_location":"Lahore","rider_id":3}', 'kitchen', '2025-09-04 16:37:27'),
('727c9280-8740-11f0-803e-d0abd5528efa', 126, 'tenant-1', 'created', '{"items":[{"item_id":11,"name":"Chicken Burger","quantity":5,"price":100}],"total_price":500,"status":"pending","customerName":"Abdullah","customerPhone":"03269746020","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'admin', '2025-09-01 14:32:11'),
('76ad1c3f-8b57-11f0-9374-d0abd5528efa', 145, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"canceled","customerName":"Hassan Abdullah","customerPhone":"090898786687","preparation_start_time":null,"preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-06 19:27:01'),
('7a922616-89ad-11f0-b91f-d0abd5528efa', 132, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":4,"price":150}],"total_price":600,"status":"enroute","customerName":"Ali","customerPhone":"08978575647874","preparation_start_time":"2025-09-04T11:37:03.000Z","preparation_end_time":"2025-09-04T11:37:27.000Z","delivery_start_time":"2025-09-04 16:37:42","delivery_end_time":null,"is_delivery":true,"customer_location":"Lahore","rider_id":3}', 'rider', '2025-09-04 16:37:42'),
('7c147983-88d8-11f0-add2-d0abd5528efa', 130, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"preparing","customerName":"Abdullah","customerPhone":"979786757645","preparation_start_time":"2025-09-03 15:13:02","preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":1,"customer_location":"https://www.google.com/maps?q=31.5203915,74.3183745","rider_id":null}', 'admin', '2025-09-03 15:13:02'),
('7deb4801-8ab8-11f0-b70d-d0abd5528efa', 144, 'tenant-1', 'created', '{"items":[{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Faiza Gujjar","customerPhone":"98978786868","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-06 00:29:03'),
('7f8640cc-875c-11f0-803e-d0abd5528efa', 128, 'tenant-1', 'created', '{"items":[{"item_id":10,"name":"Patty Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Abdullah Malik","customerPhone":"03045676466","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'admin', '2025-09-01 17:52:59'),
('80de4b70-88ea-11f0-add2-d0abd5528efa', 129, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"enroute","customerName":"Ali","customerPhone":"09090908978686","preparation_start_time":"2025-09-03T12:01:18.000Z","preparation_end_time":"2025-09-03T12:01:58.000Z","delivery_start_time":"2025-09-03 17:22:01","delivery_end_time":null,"is_delivery":true,"customer_location":"https://www.google.com/maps?q=31.585241,74.345039","rider_id":3}', 'rider', '2025-09-03 17:22:01'),
('8c1bed83-88ea-11f0-add2-d0abd5528efa', 129, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"delivered","customerName":"Ali","customerPhone":"09090908978686","preparation_start_time":"2025-09-03T12:01:18.000Z","preparation_end_time":"2025-09-03T12:01:58.000Z","delivery_start_time":"2025-09-03T12:22:01.000Z","delivery_end_time":"2025-09-03 17:22:20","is_delivery":true,"customer_location":"https://www.google.com/maps?q=31.585241,74.345039","rider_id":3}', 'rider', '2025-09-03 17:22:20'),
('92f9972d-88d8-11f0-add2-d0abd5528efa', 130, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"completed","customerName":"Abdullah","customerPhone":"979786757645","preparation_start_time":"2025-09-03T10:13:02.000Z","preparation_end_time":"2025-09-03 15:13:40","delivery_start_time":null,"delivery_end_time":null,"is_delivery":1,"customer_location":"https://www.google.com/maps?q=31.5203915,74.3183745","rider_id":null}', 'admin', '2025-09-03 15:13:40'),
('9469bc30-8ab4-11f0-b70d-d0abd5528efa', 139, 'tenant-1', 'created', '{"items":[{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Fiza","customerPhone":"97978686868","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-06 00:01:03'),
('968571bb-873f-11f0-803e-d0abd5528efa', 125, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Rayan","customerPhone":"03004576908","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'admin', '2025-09-01 14:26:02'),
('9a1107bd-89ad-11f0-b91f-d0abd5528efa', 132, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":4,"price":150}],"total_price":600,"status":"delivered","customerName":"Ali","customerPhone":"08978575647874","preparation_start_time":"2025-09-04T11:37:03.000Z","preparation_end_time":"2025-09-04T11:37:27.000Z","delivery_start_time":"2025-09-04T11:37:42.000Z","delivery_end_time":"2025-09-04 16:38:35","is_delivery":true,"customer_location":"Lahore","rider_id":3}', 'rider', '2025-09-04 16:38:35'),
('9c54d40e-88e7-11f0-add2-d0abd5528efa', 129, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"preparing","customerName":"Ali","customerPhone":"09090908978686","preparation_start_time":"2025-09-03 17:01:18","preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":true,"customer_location":"https://www.google.com/maps?q=31.585241,74.345039","rider_id":null}', 'admin', '2025-09-03 17:01:19'),
('9cba666c-88d8-11f0-add2-d0abd5528efa', 130, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"enroute","customerName":"Abdullah","customerPhone":"979786757645","preparation_start_time":"2025-09-03T10:13:02.000Z","preparation_end_time":"2025-09-03T10:13:40.000Z","delivery_start_time":"2025-09-03 15:13:57","delivery_end_time":null,"is_delivery":1,"customer_location":"https://www.google.com/maps?q=31.5203915,74.3183745","rider_id":3}', 'rider', '2025-09-03 15:13:57'),
('9ce90d5f-8b5c-11f0-9374-d0abd5528efa', 144, 'tenant-1', 'updated', '{"items":[{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":100,"status":"canceled","customerName":"Faiza Gujjar","customerPhone":"98978786868","preparation_start_time":null,"preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-06 20:03:53'),
('a62bcb81-88d8-11f0-add2-d0abd5528efa', 130, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"delivered","customerName":"Abdullah","customerPhone":"979786757645","preparation_start_time":"2025-09-03T10:13:02.000Z","preparation_end_time":"2025-09-03T10:13:40.000Z","delivery_start_time":"2025-09-03T10:13:57.000Z","delivery_end_time":"2025-09-03 15:14:13","is_delivery":1,"customer_location":"https://www.google.com/maps?q=31.5203915,74.3183745","rider_id":3}', 'rider', '2025-09-03 15:14:13'),
('a855e2db-8b5c-11f0-9374-d0abd5528efa', 146, 'tenant-1', 'created', '{"items":[{"item_id":10,"name":"Patty Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Ali Hassan","customerPhone":"989786868679","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-06 20:04:12'),
('ac644a0f-8ab7-11f0-b70d-d0abd5528efa', 143, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100},{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100},{"item_id":10,"name":"Patty Burger","quantity":1,"price":100}],"total_price":300,"status":"pending","customerName":"Faiza Ali","customerPhone":"9898988787878","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-06 00:23:12'),
('b3f4722a-88e7-11f0-add2-d0abd5528efa', 129, 'tenant-1', 'updated', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"completed","customerName":"Ali","customerPhone":"09090908978686","preparation_start_time":"2025-09-03T12:01:18.000Z","preparation_end_time":"2025-09-03 17:01:58","delivery_start_time":null,"delivery_end_time":null,"is_delivery":true,"customer_location":"https://www.google.com/maps?q=31.585241,74.345039","rider_id":null}', 'admin', '2025-09-03 17:01:58'),
('be558375-875c-11f0-803e-d0abd5528efa', 127, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":2,"price":150}],"total_price":300,"status":"completed","customerName":"Hassan Ali","customerPhone":"03020392982","preparation_start_time":null,"preparation_end_time":"2025-09-01 17:54:44","delivery_start_time":null,"delivery_end_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'admin', '2025-09-01 17:54:44'),
('cc919593-8913-11f0-89fe-d0abd5528efa', 131, 'tenant-1', 'created', '{"items":[{"item_id":8,"name":"Shawarma","quantity":3,"price":150}],"total_price":450,"status":"pending","customerName":"Ali","customerPhone":"0347890789","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'admin', '2025-09-03 22:17:37'),
('d35fb99d-8aab-11f0-89cb-d0abd5528efa', 133, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"ali","customerPhone":"87868585687","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-05 22:58:23'),
('dd652fd4-8913-11f0-89fe-d0abd5528efa', 131, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":3,"price":150},{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":550,"status":"pending","customerName":"Ali","customerPhone":"0347890789","preparation_start_time":null,"preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'admin', '2025-09-03 22:18:06'),
('e804cefb-891b-11f0-89fe-d0abd5528efa', 131, 'tenant-1', 'updated', '{"items":[{"item_id":8,"name":"Shawarma","quantity":3,"price":150},{"item_id":11,"name":"Chicken Burger","quantity":1,"price":100}],"total_price":550,"status":"preparing","customerName":"Ali","customerPhone":"0347890789","preparation_start_time":"2025-09-03 23:15:39","preparation_end_time":null,"delivery_start_time":null,"delivery_end_time":null,"is_delivery":false,"customer_location":null,"rider_id":null}', 'admin', '2025-09-03 23:15:39'),
('ec7b6049-8ab5-11f0-b70d-d0abd5528efa', 140, 'tenant-1', 'created', '{"items":[{"item_id":7,"name":"Zinger Burger","quantity":1,"price":100}],"total_price":100,"status":"pending","customerName":"Farhan Ali","customerPhone":"99989898989","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'customer', '2025-09-06 00:10:40'),
('eec38681-8755-11f0-803e-d0abd5528efa', 127, 'tenant-1', 'created', '{"items":[{"item_id":8,"name":"Shawarma","quantity":2,"price":150}],"total_price":300,"status":"pending","customerName":"Hassan Ali","customerPhone":"03020392982","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'admin', '2025-09-01 17:05:59'),
('fe4edb25-8aab-11f0-89cb-d0abd5528efa', 134, 'tenant-1', 'created', '{"items":[{"item_id":8,"name":"Shawarma","quantity":5,"price":150}],"total_price":750,"status":"pending","customerName":"Ali","customerPhone":"98978686768","preparation_start_time":null,"is_delivery":0,"customer_location":null,"rider_id":null}', 'admin', '2025-09-05 22:59:35');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE IF NOT EXISTS `notifications` (
  `notification_id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `type` enum('order','system','stock','rider') NOT NULL DEFAULT 'order',
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`notification_id`),
  KEY `tenant_id` (`tenant_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`) ON DELETE CASCADE,
  CONSTRAINT `notifications_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- No sample data for notifications

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;