<?php
/**
 * GET    /api/wishlist.php            the wished products of the account
 * POST   /api/wishlist.php            add one product to the wishlist
 * DELETE /api/wishlist.php            remove one product from the wishlist
 *
 * "Save for later": a list of products the account wants to find again, kept
 * on the server like the cart. All three methods need an account.
 *
 * Body of the POST and DELETE:
 *   { "product_id": 3 }
 * Adding a product that is already in the list is not an error: it is simply
 * already there. Removing one that is not there is not an error either.
 */

require_once __DIR__ . '/helpers.php';

$user = require_login();

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        send_wishlist($user);
        break;

    case 'POST':
        add_to_wishlist($user);
        break;

    case 'DELETE':
        remove_from_wishlist($user);
        break;

    default:
        header('Allow: GET, POST, DELETE');
        json_error('Method not allowed. Use GET, POST or DELETE.', 405);
}


/** Sends the wished products of the account. */
function send_wishlist(array $user): void
{
    $sql = 'SELECT p.id, p.name, p.price, p.discount_price, p.image_url, p.stock,
                   c.id AS category_id, c.name AS category_name
            FROM wishlist AS w
            INNER JOIN products AS p ON p.id = w.product_id
            INNER JOIN categories AS c ON c.id = p.category_id
            WHERE w.user_id = :user_id
            ORDER BY w.created_at DESC, p.name ASC';

    try {
        $statement = db()->prepare($sql);
        $statement->execute(['user_id' => $user['id']]);
        $rows = $statement->fetchAll();
    } catch (PDOException $e) {
        error_log('[API wishlist] ' . $e->getMessage());
        json_error('Failed to load the wishlist', 500);
    }

    json_success(array_map('cast_product_types', $rows));
}


/** Adds one product to the wishlist. */
function add_to_wishlist(array $user): void
{
    $body = read_json_body();
    $productId = (int) ($body['product_id'] ?? 0);

    if ($productId <= 0) {
        json_error('A valid product_id is required.', 400);
    }

    try {
        $statement = db()->prepare('SELECT id FROM products WHERE id = :id');
        $statement->execute(['id' => $productId]);
        if ($statement->fetch() === false) {
            json_error('This product does not exist.', 404);
        }

        // INSERT IGNORE: adding a product already in the list is a no-op, not
        // a duplicate-key error. "Save this" twice must not upset the visitor.
        $insert = db()->prepare(
            'INSERT IGNORE INTO wishlist (user_id, product_id) VALUES (:user, :product)'
        );
        $insert->execute(['user' => $user['id'], 'product' => $productId]);
    } catch (PDOException $e) {
        error_log('[API wishlist] ' . $e->getMessage());
        json_error('The wishlist could not be updated', 500);
    }

    json_success(null);
}


/** Removes one product from the wishlist. */
function remove_from_wishlist(array $user): void
{
    $body = read_json_body();
    $productId = (int) ($body['product_id'] ?? 0);

    if ($productId <= 0) {
        json_error('A valid product_id is required.', 400);
    }

    try {
        $statement = db()->prepare(
            'DELETE FROM wishlist WHERE user_id = :user AND product_id = :product'
        );
        $statement->execute(['user' => $user['id'], 'product' => $productId]);
    } catch (PDOException $e) {
        error_log('[API wishlist] ' . $e->getMessage());
        json_error('The wishlist could not be updated', 500);
    }

    json_success(null);
}