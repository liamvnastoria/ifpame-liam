<?php
/**
 * GET /api/categories.php
 *
 * Returns the category list with the number of products in each one.
 * The catalogue uses it to build its category filter.
 */

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed. Use GET.', 405);
}

// LEFT JOIN and not INNER JOIN: a category that contains no product must
// still appear in the filter, with a count of 0. An INNER JOIN would silently
// hide it, and the visitor would never understand why a category exists in
// the database but not in the menu.
//
// GROUP BY collapses all the rows of one category into a single row, which is
// what allows COUNT() to summarise them. We count p.id (a product column) and
// not c.id: with a LEFT JOIN, c.id is never NULL, so COUNT(c.id) would return
// 1 even for an empty category.
$sql = 'SELECT c.id, c.name, COUNT(p.id) AS product_count
        FROM categories AS c
        LEFT JOIN products AS p ON p.category_id = c.id
        GROUP BY c.id, c.name
        ORDER BY c.name ASC';

try {
    // prepare() + execute() even without any parameter: a single habit
    // ("values always go through parameters") is less error-prone than
    // deciding case by case when query() would be acceptable.
    $statement = db()->prepare($sql);
    $statement->execute();
    $categories = $statement->fetchAll();
} catch (PDOException $e) {
    error_log('[API categories] ' . $e->getMessage());
    json_error('Failed to load the categories', 500);
}

// COUNT() always comes back from MySQL as a string, so it is converted here
// for the same reason as prices in cast_product_types().
$categories = array_map(static function (array $category): array {
    $category['id']            = (int) $category['id'];
    $category['product_count'] = (int) $category['product_count'];

    return $category;
}, $categories);

json_success($categories);
