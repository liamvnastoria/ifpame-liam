-- =============================================================
--  Database schema - small teaching e-commerce project
-- =============================================================
--  Import with:  mysql -u root -p < database/schema.sql
--  This file is meant to be re-run from scratch at any time,
--  which is why every table is dropped before being created.
-- =============================================================

CREATE DATABASE IF NOT EXISTS shop
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE shop;

-- utf8mb4 stores accents and every emoji correctly. Without this,
-- product names like "Étagère" could be imported as "Ã‰tagÃ¨re".
SET NAMES utf8mb4;

-- Tables are dropped in the REVERSE order of their creation.
-- order_items references orders and products, so it must disappear
-- first: MySQL refuses to drop a table that another table points to.
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;


-- =============================================================
--  categories
--  One row per product family. No hierarchy: a category has no parent.
-- =============================================================
CREATE TABLE categories (
  id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  -- Two categories named "Mobilier" would be a data mistake, not a feature.
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;


-- =============================================================
--  products
--  One row per item sold. Belongs to exactly one category.
-- =============================================================
CREATE TABLE products (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NOT NULL,
  name        VARCHAR(150) NOT NULL,
  description TEXT NULL,
  -- DECIMAL, never FLOAT: money must be exact. FLOAT would store
  -- 49.90 as 49.8999996185... and round the wrong way when summed.
  price       DECIMAL(10,2) NOT NULL,
  -- UNSIGNED makes a negative stock impossible at the database level.
  stock       INT UNSIGNED NOT NULL DEFAULT 0,
  -- NULL means "no picture yet"; the frontend then shows a placeholder.
  -- We do not store a full filesystem path here: the column is a URL,
  -- the display is a frontend concern.
  image_url   VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- The foreign key also indexes category_id automatically; this index is
  -- declared only to make the intent obvious in the file.
  KEY idx_products_category (category_id),
  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    -- RESTRICT: deleting a category that still has products must fail,
    -- otherwise those products would point to a category that no longer exists.
    ON DELETE RESTRICT,
  CONSTRAINT chk_products_price CHECK (price >= 0)
) ENGINE=InnoDB;


-- =============================================================
--  orders
--  One row per placed order.
--  There is no "customers" table because there is no login: the customer
--  information is per-order data, not an identity we can recognise again.
--  There is no "status" column for the same reason: with no payment step
--  and no admin area, every order would be stuck on the same status.
-- =============================================================
CREATE TABLE orders (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_name    VARCHAR(100) NOT NULL,
  customer_email   VARCHAR(150) NOT NULL,
  customer_address VARCHAR(255) NOT NULL,
  -- Stored as a snapshot of what the customer was shown when confirming.
  -- It is always computed by PHP from the prices read back from the
  -- database: the browser is never trusted for an amount.
  total            DECIMAL(10,2) NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_orders_total CHECK (total >= 0)
) ENGINE=InnoDB;


-- =============================================================
--  order_items
--  One row per product line inside an order.
--  This table is what makes the link between orders and products a
--  many-to-many relationship: one order has many products, and one
--  product can appear in many orders.
-- =============================================================
CREATE TABLE order_items (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  -- name and unit_price are COPIES of the current product values, taken at
  -- the moment the order is created. An invoice is a historical record, not
  -- a live view of the catalogue: if the shop raises a price tomorrow, past
  -- orders must keep showing the price the customer actually paid.
  -- Storing only product_id would mean displaying today's price forever.
  name       VARCHAR(150) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity   INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (product_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    -- CASCADE: an order line has no meaning without its order, so deleting
    -- the order deletes its lines instead of leaving them orphaned.
    ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    -- RESTRICT: a product used in an order can no longer be deleted, so the
    -- history stays readable.
    ON DELETE RESTRICT,
  CONSTRAINT chk_order_items_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;


-- =============================================================
--  Demo data
-- =============================================================

-- Explicit ids (instead of letting AUTO_INCREMENT guess them) so the products
-- below can reference them without ambiguity.
INSERT INTO categories (id, name) VALUES
  (1, 'Mobilier'),
  (2, 'Luminaires'),
  (3, 'Décoration');

-- image_url is left NULL on purpose: the catalogue will display a CSS
-- placeholder. Fill this column later if you add real pictures.
INSERT INTO products (category_id, name, description, price, stock) VALUES
  (1, 'Chaise en bois',
      'Chaise en hêtre massif, assise moulée, empilable.', 49.90, 12),
  (1, 'Table basse chêne',
      'Plateau en chêne huilé, piètement acier noir. 110 x 60 cm.', 129.00, 5),
  -- Stock at 0: used to test the "out of stock" case.
  (1, 'Étagère murale',
      'Trois tablettes en pin, fixation murale incluse.', 39.50, 0),
  (2, 'Lampadaire arc',
      'Abat-jour tissu, hauteur 180 cm, interrupteur au pied.', 89.00, 7),
  (2, 'Lampe de bureau',
      'LED orientable, trois intensités, port USB.', 24.90, 20),
  -- Low stock: used to test ordering more than the available quantity.
  (2, 'Suspension rotin',
      'Abat-jour en rotin tressé main, câble réglable.', 59.00, 2),
  (3, 'Vase en céramique',
      'Vase émaillé bleu profond, hauteur 28 cm.', 19.90, 30),
  (3, 'Miroir rond doré',
      'Cadre métal doré, diamètre 50 cm.', 74.00, 4);

-- No orders are inserted: they must be created through the application,
-- otherwise the demo data would not match what POST /api/orders.php produces.
