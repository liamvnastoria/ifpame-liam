<?php
/**
 * GET /api/product.php?id=1
 *
 * Returns one product, or explains why it cannot be returned.
 * This is the endpoint the product detail page uses.
 */

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed. Use GET.', 405);
}

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

// HTTP 400 "Bad Request": the request itself is wrong (no usable id).
// It is the caller's mistake, and replaying the exact same URL will never
// work, which is exactly what a 4xx tells the browser.
if ($id <= 0) {
    json_error('Query parameter "id" is required and must be a positive integer.', 400);
}

// Here "description" is selected, unlike in products.php: the detail page is
// the only place that needs the long text.
$sql = 'SELECT p.id, p.name, p.description, p.price, p.discount_price, p.stock, p.image_url,
               c.id AS category_id, c.name AS category_name
        FROM products AS p
        INNER JOIN categories AS c ON c.id = p.category_id
        WHERE p.id = :id';

try {
    $statement = db()->prepare($sql);
    $statement->execute(['id' => $id]);
    // fetch() returns the first matching row, or false when there is none.
    $product = $statement->fetch();
} catch (PDOException $e) {
    error_log('[API product] ' . $e->getMessage());
    json_error('Failed to load the product', 500);
}

// HTTP 404 "Not Found": the request is perfectly valid, but no product has
// this id. The difference with 400 matters: 400 = fix your request,
// 404 = your request was right, the resource simply does not exist.
if ($product === false) {
    json_error('Product not found', 404);
}

json_success(cast_product_types($product));
