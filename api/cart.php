<?php
/**
 * GET    /api/cart.php            the cart of the logged-in account
 * POST   /api/cart.php            add or set the quantity of one product
 * DELETE /api/cart.php            remove one product, or clear the whole cart
 *
 * The cart lives on the SERVER, linked to the account, so it is the same on
 * every device and survives the browser being closed. All three methods need
 * an account: there is no anonymous cart anymore, on purpose (see the choice
 * made for this project in the README of the cart feature).
 *
 * Body of the POST:
 *   { "product_id": 3, "quantity": 2, "action": "add" | "set" }
 *   "add" raises the quantity already in the cart, "set" fixes it to the value.
 *
 * Body of the DELETE:
 *   { "product_id": 3 } to remove one product, or {} to empty the cart.
 *
 * Every response has the same shape: { items, count, total }.
 *   items = [{ id, name, price, image_url, stock, quantity }]
 *   count = total number of articles (quantities added up)
 *   total = sum of price x quantity, where price is the effective unit price
 *           (the promotion price when there is one)
 */

require_once __DIR__ . '/helpers.php';

// Every method needs an account: checked once, before anything else.
$user = require_login();

$pdo = db();

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        json_success(cart_snapshot($pdo, $user['id']));
        break;

    case 'POST':
        add_or_set_item($pdo, $user);
        break;

    case 'DELETE':
        delete_item($pdo, $user);
        break;

    default:
        header('Allow: GET, POST, DELETE');
        json_error('Method not allowed. Use GET, POST or DELETE.', 405);
}

/**
 * Builds the current cart: lines joined with the products, plus count and
 * total. All three API methods end with this same object, so the frontend
 * always has the full picture after any operation.
 */
function cart_snapshot(PDO $pdo, int $userId): array
{
    // The cart stores only quantities; names, prices and stock are read back
    // from products at every request, so a changed price shows immediately.
    $sql = 'SELECT p.id, p.name, p.price, p.discount_price, p.image_url, p.stock,
                   ci.quantity
            FROM cart_items AS ci
            INNER JOIN products AS p ON p.id = ci.product_id
            WHERE ci.user_id = :user_id
            ORDER BY p.name ASC';

    $statement = $pdo->prepare($sql);
    $statement->execute(['user_id' => $userId]);
    $rows = $statement->fetchAll();

    $items = [];
    $count = 0;
    $totalCents = 0;

    foreach ($rows as $row) {
        // price holds the EFFECTIVE price the customer will pay: the promotion
        // price when there is one, the catalogue price otherwise. It is what
        // the frontend shows in the cart, and it matches what POST
        // /api/orders.php will actually charge.
        $effectivePrice = $row['discount_price'] === null
            ? (float) $row['price']
            : (float) $row['discount_price'];

        $quantity = (int) $row['quantity'];
        $count += $quantity;
        // Money in cents, as integers: see the explanation in orders.php.
        $totalCents += (int) round($effectivePrice * 100) * $quantity;

        $items[] = [
            'id'         => (int) $row['id'],
            'name'       => $row['name'],
            'price'      => $effectivePrice,
            'image_url'  => $row['image_url'],
            'stock'      => (int) $row['stock'],
            'quantity'   => $quantity,
        ];
    }

    return [
        'items' => $items,
        'count' => $count,
        'total' => $totalCents / 100,
    ];
}

/**
 * Adds to (action "add") or sets (action "set") the quantity of one product.
 * The product must exist and the requested quantity must not exceed its stock.
 */
function add_or_set_item(PDO $pdo, array $user): void
{
    $body = read_json_body();

    $productId = (int) ($body['product_id'] ?? 0);
    $quantity  = (int) ($body['quantity'] ?? 0);
    $action    = is_string($body['action'] ?? null) ? $body['action'] : 'add';

    if ($productId <= 0) {
        json_error('A valid product_id is required.', 400);
    }
    if ($quantity < 1 || $quantity > 99) {
        json_error('A quantity must be between 1 and 99.', 400);
    }
    if (!in_array($action, ['add', 'set'], true)) {
        json_error('The action must be "add" or "set".', 400);
    }

    // The stock is read at this moment, never trusted from the request.
    $statement = $pdo->prepare('SELECT id, name, stock FROM products WHERE id = :id');
    $statement->execute(['id' => $productId]);
    $product = $statement->fetch();

    if ($product === false) {
        json_error('This product does not exist.', 404);
    }

    $currentQuantity = 0;
    $check = $pdo->prepare('SELECT quantity FROM cart_items WHERE user_id = :user AND product_id = :product');
    $check->execute(['user' => $user['id'], 'product' => $productId]);
    $existing = $check->fetch();
    if ($existing !== false) {
        $currentQuantity = (int) $existing['quantity'];
    }

    // "add" piles up on what is already in the cart, "set" ignores it. Either
    // way the quantity never goes above the stock known right now.
    $finalQuantity = $action === 'add' ? $currentQuantity + $quantity : $quantity;
    if ($finalQuantity > (int) $product['stock']) {
        json_error(
            'Not enough stock for "' . $product['name'] . '" (only ' . (int) $product['stock'] . ' left).',
            409
        );
    }
    if ($finalQuantity < 1) {
        // A "set" to 0 means "remove this line", like the minus button on the
        // cart page. Removing is handled below.
        $finalQuantity = 1;
    }

    // Upsert: one INSERT ... ON DUPLICATE KEY UPDATE instead of a SELECT then
    // INSERT or UPDATE. The UNIQUE (user_id, product_id) key is what makes
    // MySQL choose to update the existing row instead of failing.
    $upsert = $pdo->prepare(
        'INSERT INTO cart_items (user_id, product_id, quantity)
         VALUES (:user, :product, :quantity)
         ON DUPLICATE KEY UPDATE quantity = :quantity_again'
    );
    try {
        $upsert->execute([
            'user' => $user['id'],
            'product' => $productId,
            'quantity' => $finalQuantity,
            'quantity_again' => $finalQuantity,
        ]);
    } catch (PDOException $e) {
        error_log('[API cart] ' . $e->getMessage());
        json_error('The cart could not be updated', 500);
    }

    json_success(cart_snapshot($pdo, $user['id']));
}

/**
 * Removes one product from the cart, or the whole cart when no product_id is
 * sent. Deleting the account's own lines is the only delete the endpoint
 * accepts: the user id always comes from the session.
 */
function delete_item(PDO $pdo, array $user): void
{
    $body = read_json_body();
    $productId = (int) ($body['product_id'] ?? 0);

    try {
        if ($productId <= 0) {
            $statement = $pdo->prepare('DELETE FROM cart_items WHERE user_id = :user');
            $statement->execute(['user' => $user['id']]);
        } else {
            $statement = $pdo->prepare(
                'DELETE FROM cart_items WHERE user_id = :user AND product_id = :product'
            );
            $statement->execute(['user' => $user['id'], 'product' => $productId]);
        }
    } catch (PDOException $e) {
        error_log('[API cart] ' . $e->getMessage());
        json_error('The cart could not be updated', 500);
    }

    json_success(cart_snapshot($pdo, $user['id']));
}