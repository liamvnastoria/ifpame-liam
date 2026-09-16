-- =============================================================
--  Database schema - small teaching e-commerce project
--  Theme: computer hardware and peripherals shop
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
-- product names like "Écran" could be imported as "Ã‰cran".
SET NAMES utf8mb4;

-- Tables are dropped in the REVERSE order of their creation.
-- order_items references orders and products, so it must disappear
-- first: MySQL refuses to drop a table that another table points to.
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
-- users must disappear after orders: orders.user_id points to it, and MySQL
-- refuses to drop a table that another one still references.
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;


-- =============================================================
--  categories
--  TWO LEVELS, as on a real retail site:
--    - a department (parent_id IS NULL)   e.g. "Ordinateurs"
--    - a sub-category (parent_id filled)  e.g. "Ordinateurs portables"
--  The foreign key points to the SAME table: a category is linked to
--  another category. This is called a self-referencing (or recursive)
--  relationship, and two levels are enough to model a catalogue menu
--  without needing a recursive query.
-- =============================================================
CREATE TABLE categories (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name      VARCHAR(100) NOT NULL,
  -- NULL means "this is a department". A sub-category points to its parent.
  parent_id INT UNSIGNED NULL,
  PRIMARY KEY (id),
  -- Two categories named "Écrans" would be a data mistake, not a feature.
  UNIQUE KEY uq_categories_name (name),
  KEY idx_categories_parent (parent_id),
  CONSTRAINT fk_categories_parent
    FOREIGN KEY (parent_id) REFERENCES categories (id)
    -- RESTRICT: deleting a department that still has sub-categories fails,
    -- otherwise those sub-categories would point to something that is gone.
    ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =============================================================
--  products
--  One row per item sold. Belongs to exactly one category (in practice a
--  sub-category; MySQL cannot express that rule, our code keeps it).
-- =============================================================
CREATE TABLE products (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id    INT UNSIGNED NOT NULL,
  name           VARCHAR(150) NOT NULL,
  description    TEXT NULL,
  -- DECIMAL, never FLOAT: money must be exact. FLOAT would store
  -- 899.00 as 898.99993896... and round the wrong way when summed.
  price          DECIMAL(10,2) NOT NULL,
  -- The normal price stays in "price" and the promo price lives here.
  -- Keeping both lets the page display the crossed-out original price AND
  -- the amount actually charged. NULL means "no promotion".
  -- The CHECK below makes a nonsense promo impossible: a discount must be
  -- positive and strictly cheaper than the normal price.
  -- (MySQL ignores a CHECK only on versions older than 8.0.16, in which case
  -- this rule is enforced by PHP alone.)
  discount_price DECIMAL(10,2) NULL,
  -- UNSIGNED makes a negative stock impossible at the database level.
  stock          INT UNSIGNED NOT NULL DEFAULT 0,
  -- NULL means "no picture yet"; the frontend then shows a coloured
  -- placeholder with the product initial. The column stores a URL, not a
  -- filesystem path: how a picture is displayed is a frontend concern.
  image_url      VARCHAR(255) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- The foreign key also indexes category_id automatically; this index is
  -- declared only to make the intent obvious in the file.
  KEY idx_products_category (category_id),
  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_products_price CHECK (price >= 0),
  CONSTRAINT chk_products_discount
    CHECK (discount_price IS NULL OR (discount_price > 0 AND discount_price < price))
) ENGINE=InnoDB;


-- =============================================================
--  users
--  One row per customer account.
-- =============================================================
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  -- The column holds a HASH, never the password itself: a database leak must
  -- not hand the passwords over to whoever reads it. 255 characters because
  -- the length of password_hash() output depends on the algorithm (60 for
  -- bcrypt today, more if PHP changes its default one day).
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- The database refuses two accounts with the same e-mail. PHP checks the
  -- address too, so it can answer with a clear message, but this UNIQUE
  -- index is the real guarantee: two registrations at the same second cannot
  -- both succeed, whatever PHP does.
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;


-- =============================================================
--  orders
--  One row per placed order.
--
--  user_id links the order to the account that placed it. The column is
--  NULLABLE, but not because ordering without an account is allowed: the API
--  refuses to create an order without a logged-in user. It is nullable
--  because of ON DELETE SET NULL below (an account can disappear without
--  taking the shop's sales history with it).
--
--  customer_name and customer_email are STILL copied from the account at the
--  moment of the order, exactly like the price in order_items: an invoice must
--  not change because the account was renamed or deleted later. The order is
--  a record of what happened, not a view of the account as it is today.
--
--  There is no "status" column: with no payment step and no admin area,
--  every order would be stuck on the same status.
-- =============================================================
CREATE TABLE orders (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NULL,
  customer_name    VARCHAR(100) NOT NULL,
  customer_email   VARCHAR(150) NOT NULL,
  customer_address VARCHAR(255) NOT NULL,
  -- Stored as a snapshot of what the customer was shown when confirming.
  -- It is always computed by PHP from the prices read back from the
  -- database: the browser is never trusted for an amount.
  total            DECIMAL(10,2) NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_orders_user (user_id),
  CONSTRAINT fk_orders_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    -- SET NULL and not RESTRICT: deleting an account must neither be blocked
    -- by its past orders nor erase them. The order stays, its customer
    -- snapshot stays, only the link to the account disappears.
    ON DELETE SET NULL,
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
--  Demo data - categories
-- =============================================================

-- Departments first (parent_id NULL), then sub-categories. The order matters:
-- a sub-category references its department, and the foreign key would refuse
-- a row pointing to a department that does not exist yet.
INSERT INTO categories (id, name, parent_id) VALUES
  (1, 'Ordinateurs', NULL),
  (2, 'Écrans', NULL),
  (3, 'Périphériques', NULL),
  (4, 'Composants et stockage', NULL);

INSERT INTO categories (id, name, parent_id) VALUES
  (5,  'Ordinateurs portables', 1),
  (6,  'PC de bureau', 1),
  (7,  'Tablettes', 1),
  (8,  'Écrans 24 à 27 pouces', 2),
  (9,  'Écrans ultra-larges', 2),
  (10, 'Supports et bras', 2),
  (11, 'Claviers', 3),
  (12, 'Souris et tapis', 3),
  (13, 'Casques et micros', 3),
  (14, 'Cartes graphiques', 4),
  (15, 'Mémoire et stockage', 4),
  (16, 'Boîtiers et alimentations', 4);


-- =============================================================
--  Demo data - products
--  Explicit ids so the demo orders below can reference them without
--  ambiguity. image_url stays NULL: the frontend shows a placeholder.
--  discount_price is set on a few products so the homepage has a real
--  "promotions" row to display.
-- =============================================================
INSERT INTO products (id, category_id, name, description, price, discount_price, stock) VALUES
  -- Ordinateurs portables
  (1,  5, 'Ultrabook 14 pouces',
        'Processeur 8 cœurs, 16 Go de RAM, SSD 512 Go, 1,2 kg.', 899.00, 799.00, 6),
  (2,  5, 'PC portable gaming 15 pouces',
        'Carte graphique dédiée 8 Go, dalle 144 Hz, 16 Go de RAM.', 1249.00, NULL, 3),
  (3,  5, 'PC portable étudiant 15 pouces',
        'Processeur 6 cœurs, 8 Go de RAM, SSD 256 Go, clavier rétroéclairé.', 549.00, NULL, 14),
  (4,  5, 'PC portable professionnel 14 pouces',
        'Châssis aluminium, 32 Go de RAM, écran mat, lecteur d''empreintes.', 1149.00, 1049.00, 5),
  -- PC de bureau
  (5,  6, 'PC de bureau familial',
        'Processeur 6 cœurs, 16 Go de RAM, SSD 512 Go, clavier et souris inclus.', 649.00, NULL, 8),
  (6,  6, 'PC de bureau création 3D',
        'Processeur 16 cœurs, 32 Go de RAM, carte graphique 12 Go.', 1599.00, NULL, 2),
  (7,  6, 'Mini PC silencieux',
        'Format compact 0,6 litre, 16 Go de RAM, deux sorties 4K.', 449.00, 399.00, 10),
  -- Tablettes
  (8,  7, 'Tablette 11 pouces',
        'Écran 120 Hz, 128 Go de stockage, stylet compatible.', 379.00, NULL, 12),
  (9,  7, 'Tablette lecture 8 pouces',
        'Écran mat antireflet, autonomie 3 semaines, 64 Go.', 179.00, NULL, 0),
  -- Écrans 24 à 27 pouces
  (10, 8, 'Écran 24 pouces Full HD',
        'Dalle IPS 75 Hz, HDMI et DisplayPort, pied réglable en hauteur.', 119.00, NULL, 18),
  (11, 8, 'Écran 27 pouces QHD 165 Hz',
        'Dalle IPS 165 Hz, 1 ms, compatible FreeSync, pivot 90 degrés.', 279.00, NULL, 2),
  (12, 8, 'Écran 27 pouces 4K IPS',
        '3840 x 2160, 99 % sRGB, deux entrées HDMI et un USB-C 65 W.', 429.00, 379.00, 6),
  (13, 8, 'Écran 24 pouces incurvé 144 Hz',
        'Courbure 1500R, dalle VA, 1 ms, idéal jeu en petit budget.', 189.00, NULL, 9),
  -- Écrans ultra-larges
  (14, 9, 'Écran ultra-large 34 pouces',
        'Format 21:9, dalle VA 144 Hz, deux entrées HDMI.', 549.00, NULL, 0),
  (15, 9, 'Écran ultra-large 38 pouces incurvé',
        '3840 x 1600, dalle IPS 144 Hz, station d''accueil USB-C intégrée.', 899.00, 799.00, 3),
  (16, 9, 'Écran 29 pouces 21:9',
        '2560 x 1080, dalle IPS, compatible fixation VESA.', 299.00, NULL, 7),
  -- Supports et bras
  (17, 10, 'Bras d''écran réglable',
        'Vérin à gaz, fixation serre-joint ou passe-câble, jusqu''à 9 kg.', 79.00, NULL, 15),
  (18, 10, 'Support double écran',
        'Deux bras indépendants, norme VESA 75 et 100 mm.', 129.00, NULL, 5),
  (19, 10, 'Pied d''écran surélevé',
        'Rehausse en bambou, rangement clavier dessous, jusqu''à 20 kg.', 39.00, NULL, 20),
  -- Claviers
  (20, 11, 'Clavier mécanique TKL',
        'Format tenkeyless, switches rouges, rétroéclairage blanc, USB-C.', 89.00, NULL, 12),
  (21, 11, 'Clavier mécanique sans fil 75 %',
        'Bluetooth et 2,4 GHz, switches marrons, trois appareils mémorisés.', 119.00, 99.00, 8),
  (22, 11, 'Clavier bureautique silencieux',
        'Touches basses, filaire USB, résistant aux projections.', 39.90, NULL, 25),
  (23, 11, 'Clavier compact AZERTY',
        'Format 60 %, disposition belge, câble tressé amovible.', 29.90, NULL, 30),
  -- Souris et tapis
  (24, 12, 'Souris sans fil ergonomique',
        'Capteur 16000 dpi, six boutons, autonomie 70 jours, USB-C.', 45.50, NULL, 25),
  (25, 12, 'Souris verticale filaire',
        'Poignet en position neutre, cinq boutons, molette silencieuse.', 34.90, NULL, 16),
  (26, 12, 'Souris gaming 26000 dpi',
        'Capteur optique, huit boutons programmables, 74 g.', 69.00, 59.00, 11),
  (27, 12, 'Tapis de bureau XL',
        '90 x 40 cm, base antidérapante, bords cousus.', 24.90, NULL, 22),
  -- Casques et micros
  (28, 13, 'Casque audio USB',
        'Micro antibruit détachable, coussinets mémoire, cordon tressé.', 69.90, NULL, 7),
  (29, 13, 'Casque sans fil à réduction de bruit',
        'Réduction active, 40 heures d''autonomie, connexion double.', 149.00, 129.00, 6),
  (30, 13, 'Microphone USB cardioïde',
        'Capsule 16 mm, pied de bureau, prise casque pour le retour.', 89.00, NULL, 9),
  -- Cartes graphiques
  (31, 14, 'Carte graphique 8 Go',
        'Double ventilateur, deux entrées HDMI, alimentation 8 broches.', 299.00, NULL, 4),
  (32, 14, 'Carte graphique 12 Go',
        'Trois ventilateurs, refroidissement semi-passif, 2,5 slots.', 489.00, NULL, 3),
  (33, 14, 'Carte graphique 16 Go',
        'Mémoire GDDR6X, sortie DisplayPort 2.1, bloc métallique.', 899.00, NULL, 1),
  -- Mémoire et stockage
  (34, 15, 'SSD NVMe 1 To',
        'Format M.2 2280, lecture 3500 Mo/s, garantie cinq ans.', 79.00, NULL, 22),
  (35, 15, 'SSD NVMe 2 To',
        'Lecture 7000 Mo/s, dissipateur inclus, garanti cinq ans.', 149.00, 129.00, 10),
  (36, 15, 'Barrette mémoire 16 Go DDR5',
        'Fréquence 5600 MHz, dissipateur bas profil, double canal.', 64.00, NULL, 9),
  (37, 15, 'Disque dur externe 2 To',
        'USB 3.2, alimenté par le port, boîtier antichoc.', 89.00, NULL, 13),
  -- Boîtiers et alimentations
  (38, 16, 'Boîtier moyen tour',
        'Panneau vitré, trois ventilateurs fournis, filtres amovibles.', 79.00, NULL, 8),
  (39, 16, 'Alimentation 650 W 80+ Gold',
        'Modulaire, ventilateur 120 mm, protection contre les surtensions.', 84.50, NULL, 5),
  (40, 16, 'Alimentation 850 W 80+ Platinum',
        'Semi-passive, câbles plats, garantie dix ans.', 149.00, NULL, 0);


-- =============================================================
--  Demo data - two customer accounts
-- =============================================================
-- Both accounts use the same password: "demo1234".
-- What is stored below is NOT that password but a bcrypt hash of it. There is
-- no way back from the hash to the password, which is the whole point: a
-- stolen database does not hand over a single password.
--
-- The hash must be one that PHP's password_verify() accepts. If your PHP
-- version refuses it, generate a fresh one and paste it here:
--     php -r "echo password_hash('demo1234', PASSWORD_DEFAULT), PHP_EOL;"
INSERT INTO users (id, name, email, password_hash) VALUES
  (1, 'Marie Dupont', 'marie.dupont@example.com',
      '$2y$10$io67s/UD198c3iecBDsi7ujaNLp9t/tGPaGGT3.5u70jyfO1OT0wW'),
  (2, 'Karim Benali', 'karim.benali@example.com',
      '$2y$10$qIYezJSta8szEwaTdvS0cu.XfCVcvBkHj09HMXp.qc0BOsUTpIwD.');


-- =============================================================
--  Demo data - a few past orders
-- =============================================================
-- These orders exist for two reasons: the homepage can show a "best sellers"
-- row (without them, the aggregate query over order_items always returns
-- zero), and the two demo accounts already have an order history to display.
--
-- They are inserted directly here and NOT through the API, which is why the
-- totals below were computed by hand and match their lines exactly. Orders 1
-- and 2 belong to Marie, orders 3 and 4 to Karim: the customer columns copy
-- the account identity, exactly as POST /api/orders.php does.
--
-- Note on line 1 of order 3: the unit price stored is 799.00, the price
-- actually paid with the promotion, not the catalogue price of 899.00. That
-- is the whole point of copying the price into order_items.
INSERT INTO orders (id, user_id, customer_name, customer_email, customer_address, total)
VALUES
  (1, 1, 'Marie Dupont', 'marie.dupont@example.com', '12 rue des Tilleuls, 5000 Namur', 247.00),
  (2, 1, 'Marie Dupont', 'marie.dupont@example.com', '12 rue des Tilleuls, 5000 Namur', 353.40),
  (3, 2, 'Karim Benali', 'karim.benali@example.com', '48 avenue de la Gare, 6000 Charleroi', 2206.00),
  (4, 2, 'Karim Benali', 'karim.benali@example.com', '48 avenue de la Gare, 6000 Charleroi', 179.50);

INSERT INTO order_items (order_id, product_id, name, unit_price, quantity) VALUES
  -- Order 1 : 89.00 + 2 x 79.00 = 247.00
  (1, 20, 'Clavier mécanique TKL', 89.00, 1),
  (1, 34, 'SSD NVMe 1 To', 79.00, 2),
  -- Order 2 : 2 x 119.00 + 45.50 + 69.90 = 353.40
  (2, 10, 'Écran 24 pouces Full HD', 119.00, 2),
  (2, 24, 'Souris sans fil ergonomique', 45.50, 1),
  (2, 28, 'Casque audio USB', 69.90, 1),
  -- Order 3 : 799.00 + 2 x 79.00 + 1249.00 = 2206.00
  (3, 1, 'Ultrabook 14 pouces', 799.00, 1),
  (3, 17, 'Bras d''écran réglable', 79.00, 2),
  (3, 2, 'PC portable gaming 15 pouces', 1249.00, 1),
  -- Order 4 : 3 x 39.90 + 2 x 29.90 = 179.50
  (4, 22, 'Clavier bureautique silencieux', 39.90, 3),
  (4, 23, 'Clavier compact AZERTY', 29.90, 2);


-- =============================================================
--  The MySQL account the application connects with
-- =============================================================
-- WHY NOT root?
--   * root can DROP DATABASE, CREATE USER and read every database on the
--     server. The site never needs any of that, and a single badly written
--     query would then be enough to lose everything. An application account
--     is the first thing you limit on a real server.
--   * On Debian and Ubuntu, root@localhost logs in through a Unix SOCKET,
--     not through TCP. PHP connects over TCP to 127.0.0.1, so "root" is
--     refused with "Access denied for user 'root'@'127.0.0.1'" -- even when
--     the password is correct. That message sends you looking for a password
--     problem when the real problem is the account itself.
--
-- WHAT THIS ACCOUNT MAY DO: read the catalogue, create an order, add its lines
--   and decrement a stock. That is everything the API does, and nothing more.
--   It cannot CREATE or DROP a table, which is exactly why this file is
--   imported by an administrator (sudo mysql < database/schema.sql) and never
--   by the website.
--
-- WARNING: a password written in a file is acceptable for a local school
--   project. On a real server it comes from an environment variable and is
--   never committed -- but then the project has more moving parts to explain.
-- Two hosts for the same account, and it is not a duplicate: the SERVER
-- decides which one applies. When MySQL is allowed to resolve addresses
-- (skip_name_resolve = OFF, the default), a connection arriving from 127.0.0.1
-- is seen as coming from "localhost" -- which is exactly how we got
-- "Access denied for user 'shop'@'localhost'" while the account
-- 'shop'@'127.0.0.1' existed and the password was right. On a server with
-- resolution disabled, the same visitor is seen as '127.0.0.1'. Creating both
-- means the project does not depend on how the server happens to be set up.
CREATE USER IF NOT EXISTS 'shop'@'localhost' IDENTIFIED BY 'shop_local';
CREATE USER IF NOT EXISTS 'shop'@'127.0.0.1' IDENTIFIED BY 'shop_local';

GRANT SELECT, INSERT, UPDATE ON shop.* TO 'shop'@'localhost';
GRANT SELECT, INSERT, UPDATE ON shop.* TO 'shop'@'127.0.0.1';
-- FLUSH PRIVILEGES reloads the rights tables. Not strictly required after a
-- GRANT, but harmless and it makes sure the new account works immediately.
FLUSH PRIVILEGES;
