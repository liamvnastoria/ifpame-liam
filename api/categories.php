<?php
/**
 * GET /api/categories.php
 *
 * Returns the catalogue structure as a TREE:
 *
 *   [
 *     { id: 1, name: "Ordinateurs", product_count: 9, children: [
 *         { id: 5, name: "Ordinateurs portables", product_count: 4, children: [] },
 *         ...
 *     ]},
 *     ...
 *   ]
 *
 * Used by the homepage (tiles + footer), by the department bar in the header
 * and by the filter menu of the catalogue page.
 */

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed. Use GET.', 405);
}

// ONE query for the whole tree. Asking the count category by category inside
// a loop would run one query per row: that is the classic "N+1 queries"
// mistake, which stays invisible on 16 rows and destroys a real catalogue.
// ORDER BY puts a department before its children, alphabetical for the rest.
$sql = 'SELECT c.id, c.name, c.parent_id, COUNT(p.id) AS product_count
        FROM categories AS c
        LEFT JOIN products AS p ON p.category_id = c.id
        GROUP BY c.id, c.name, c.parent_id
        ORDER BY c.name ASC';

try {
    // prepare() + execute() even without any parameter: a single habit
    // ("values always go through parameters") is less error-prone than
    // deciding case by case when query() would be acceptable.
    $statement = db()->prepare($sql);
    $statement->execute();
    $rows = $statement->fetchAll();
} catch (PDOException $e) {
    error_log('[API categories] ' . $e->getMessage());
    json_error('Failed to load the categories', 500);
}

// MySQL returns COUNT() and ids as strings, so they are converted here for
// the same reason as prices in cast_product_types().
$departments = [];
$children = [];

foreach ($rows as $row) {
    $row['id'] = (int) $row['id'];
    $row['product_count'] = (int) $row['product_count'];
    $row['parent_id'] = $row['parent_id'] === null ? null : (int) $row['parent_id'];
    // Every category leaves with an empty "children" list, so the JSON shape
    // is always the same whether a department has sub-categories or not.
    $row['children'] = [];

    if ($row['parent_id'] === null) {
        // The id is used as the array key: it lets us find a parent directly,
        // instead of searching the whole array again for each child.
        $departments[$row['id']] = $row;
    } else {
        $children[] = $row;
    }
}

// The tree is assembled from the two groups AFTER the query: no extra query
// is needed to know who belongs to whom.
foreach ($children as $child) {
    if (isset($departments[$child['parent_id']])) {
        $departments[$child['parent_id']]['children'][] = $child;
    }
}

// A department count must include its sub-categories: a visitor who clicks
// "Ordinateurs" expects to see every computer, not zero. The department's own
// products (if any) are already in its count, we only add the children.
foreach ($departments as $id => $department) {
    foreach ($department['children'] as $child) {
        $departments[$id]['product_count'] += $child['product_count'];
    }
}

// array_values is required: json_encode turns an array whose keys are not
// 0,1,2,... into a JSON OBJECT ({"1": {...}}) instead of an ARRAY ([{...}]).
// The frontend expects a list, so we drop the ids used as keys.
json_success(array_values($departments));
