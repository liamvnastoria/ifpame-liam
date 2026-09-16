<?php
/**
 * GET /api/products.php
 *
 * Returns the product list. Every parameter is optional:
 *   category = id of a sub-category OR of a department  (?category=2)
 *   search   = text looked for in the product name      (?search=clavier)
 *   promo    = 1 to keep only discounted products       (?promo=1)
 *   sort     = name (default) | price | id | popular
 *   limit    = maximum number of rows                   (?limit=8)
 *
 * The homepage uses this same endpoint four times (newest, cheapest,
 * promotions, best sellers) instead of having four endpoints to maintain.
 */

require_once __DIR__ . '/helpers.php';

// This endpoint only reads. Answering 405 "Method Not Allowed" is more
// accurate than 404: the URL does exist, just not with this HTTP method.
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed. Use GET.', 405);
}

// Every value coming from the URL arrives as a string, so we convert it
// ourselves. An unusable value such as ?category=abc becomes 0 and is then
// ignored, which is friendlier than rejecting the whole request (a filter is
// optional by nature).
$categoryId = isset($_GET['category']) ? (int) $_GET['category'] : 0;
$search     = isset($_GET['search']) ? trim((string) $_GET['search']) : '';
$promoOnly  = isset($_GET['promo']) && $_GET['promo'] === '1';
$sort       = isset($_GET['sort']) ? (string) $_GET['sort'] : 'name';
$limit      = isset($_GET['limit']) ? (int) $_GET['limit'] : 0;

// "sold" is the total quantity of this product across all past orders. A
// sub-query runs once per product: perfectly fine on a forty-line catalogue,
// and it keeps the main query free of GROUP BY. A real shop with 50 000
// products would store this value in a column, refreshed when an order is
// created, instead of recalculating it on every page view.
$sql = 'SELECT p.id, p.name, p.price, p.discount_price, p.stock, p.image_url,
               c.id AS category_id, c.name AS category_name,
               (SELECT COALESCE(SUM(oi.quantity), 0)
                  FROM order_items AS oi
                 WHERE oi.product_id = p.id) AS sold
        FROM products AS p
        INNER JOIN categories AS c ON c.id = p.category_id';

// Filters are gathered in an array so a condition is added only when it is
// actually used. Note what goes into this string: only fixed SQL fragments.
// The visitor's values never do, they are bound as parameters below.
$conditions = [];
$parameters = [];

if ($categoryId > 0) {
    // A department must return everything it contains: its own products AND
    // those of its sub-categories. Hence the OR on the parent link. Filtering
    // on the exact category alone would show an empty page for a department.
    // Two DIFFERENT placeholder names for the same value, and that is not a
    // style choice: with real prepared statements (ATTR_EMULATE_PREPARES is
    // false in config/database.php) PDO refuses to see the same named
    // placeholder twice and answers SQLSTATE[HY093] "Invalid parameter
    // number". The id is therefore bound a second time, under its own name.
    $conditions[] = '(p.category_id = :category_id OR c.parent_id = :parent_category_id)';
    $parameters['category_id'] = $categoryId;
    $parameters['parent_category_id'] = $categoryId;
}

if ($search !== '') {
    // With the utf8mb4_unicode_ci collation LIKE is case-insensitive, so
    // "clavier" also finds "Clavier mécanique TKL".
    // Known limit: % and _ typed by the visitor act as wildcards. Harmless
    // here, but a real shop would escape them.
    $conditions[] = 'p.name LIKE :search';
    $parameters['search'] = '%' . $search . '%';
}

if ($promoOnly) {
    // A discount of NULL means "no promotion", so IS NOT NULL keeps the
    // promoted products only.
    $conditions[] = 'p.discount_price IS NOT NULL';
}

if ($conditions !== []) {
    $sql .= ' WHERE ' . implode(' AND ', $conditions);
}

// ORDER BY can NOT receive a bound parameter: the column name is part of the
// query text itself, and a parameter may only replace a VALUE. So we never
// use the string sent by the browser: we compare it against a fixed list and
// write our own text. This is the one place where a prepared statement is not
// enough, and that is why the whitelist exists.
switch ($sort) {
    case 'price':
        $sql .= ' ORDER BY p.price ASC, p.name ASC';
        break;
    case 'id':
        // The most recently added products are the ones with the highest id.
        $sql .= ' ORDER BY p.id DESC';
        break;
    case 'popular':
        $sql .= ' ORDER BY sold DESC, p.name ASC';
        break;
    default:
        $sql .= ' ORDER BY p.name ASC';
        break;
}

// LIMIT has the same restriction as ORDER BY. It is safe here because $limit
// was cast to int above: a number cannot carry SQL code, whatever the visitor
// typed. Note that binding it as a parameter would not work with real
// prepared statements, MySQL would receive the string '8' and refuse it.
if ($limit > 0) {
    $sql .= ' LIMIT ' . $limit;
}

try {
    // prepare() sends the query structure to MySQL, execute() sends the
    // values separately: this is what makes SQL injection impossible, because
    // a value can never be interpreted as SQL code.
    $statement = db()->prepare($sql);
    $statement->execute($parameters);
    $products = $statement->fetchAll();
} catch (PDOException $e) {
    error_log('[API products] ' . $e->getMessage());
    json_error('Failed to load the products', 500);
}

// array_map applies the same conversion to every row before encoding.
$products = array_map('cast_product_types', $products);

json_success($products);
