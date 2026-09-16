<?php
/**
 * GET /api/products.php
 *
 * Returns the product list, optionally filtered.
 *
 * Optional query parameters:
 *   category = category id      (?category=1)
 *   search   = text looked for in the product name (?search=lampe)
 *
 * Example: /api/products.php?category=2&search=lampe
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

// Only the columns the catalogue really uses are selected: "description" is
// deliberately absent because only the product detail page displays it.
// Fewer columns means less data transferred and a faster query.
$sql = 'SELECT p.id, p.name, p.price, p.stock, p.image_url,
               c.id AS category_id, c.name AS category_name
        FROM products AS p
        INNER JOIN categories AS c ON c.id = p.category_id';

// Filters are gathered in an array so a condition is added only when it is
// actually used. Note what goes into this string: only fixed SQL fragments.
// The visitor's values never do, they are bound as parameters below.
$conditions = [];
$parameters = [];

if ($categoryId > 0) {
    $conditions[] = 'p.category_id = :category_id';
    $parameters['category_id'] = $categoryId;
}

if ($search !== '') {
    // With the utf8mb4_unicode_ci collation LIKE is case-insensitive, so
    // "lampe" also finds "Lampe de bureau".
    // Known limit: % and _ typed by the visitor act as wildcards. Harmless
    // here, but a real shop would escape them.
    $conditions[] = 'p.name LIKE :search';
    $parameters['search'] = '%' . $search . '%';
}

if ($conditions !== []) {
    $sql .= ' WHERE ' . implode(' AND ', $conditions);
}

$sql .= ' ORDER BY p.name ASC';

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
