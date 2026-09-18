<?php
/**
 * GET  /api/orders.php   the order history of the logged-in account
 * POST /api/orders.php   place an order from the logged-in account's cart
 *
 * Two methods on the same URL on purpose: "the orders" is one resource. GET
 * reads it, POST adds to it. There is no endpoint to read someone else's
 * orders, because the account always comes from the session.
 *
 * Body of the POST (only the address; the articles are read from the account's
 * server-side cart, NOT from the request -- the browser cannot invent a line):
 *   { "address": "12 rue des Tilleuls, 5000 Namur" }
 *
 * Shipping: 4.95 € under 75 €, free from 75 €. Prices are VAT-inclusive, so
 * the "dont TVA 21 %" amount is total * 21/121, computed by the frontend.
 */

require_once __DIR__ . '/helpers.php';

// Both methods need an account, so the check happens once, before anything
// else. A visitor who is not logged in never reaches the code below.
$user = require_login();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    send_order_history($user);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    create_order($user);
}

// The Allow header lists what this URL accepts: a client can use it instead
// of guessing, and it is what HTTP expects on a 405.
header('Allow: GET, POST');
json_error('Method not allowed. Use GET or POST.', 405);


/**
 * Sends the order history of one account, newest first, with the shipping fee
 * and the shipping address of each order.
 */
function send_order_history(array $user): void
{
    $sql = 'SELECT o.id, o.total, o.shipping, o.customer_address, o.created_at,
                   oi.product_id, oi.name, oi.unit_price, oi.quantity
            FROM orders AS o
            -- LEFT JOIN and not INNER JOIN: an order with no line must still
            -- appear. The API cannot create such an order, but the query
            -- should not depend on that promise.
            LEFT JOIN order_items AS oi ON oi.order_id = o.id
            -- The filter comes from the SESSION and never from a URL
            -- parameter: with ?user_id=3 in the query string, anyone could
            -- read the order history of another account.
            WHERE o.user_id = :user_id
            ORDER BY o.created_at DESC, o.id DESC';

    try {
        $statement = db()->prepare($sql);
        $statement->execute(['user_id' => $user['id']]);
        $rows = $statement->fetchAll();
    } catch (PDOException $e) {
        error_log('[API orders] ' . $e->getMessage());
        json_error('Failed to load the orders', 500);
    }

    // Same two-pass grouping as the category tree: first the orders, then
    // their lines are attached to the order they belong to.
    $orders = [];

    foreach ($rows as $row) {
        $orderId = (int) $row['id'];

        if (!isset($orders[$orderId])) {
            $orders[$orderId] = [
                'id'         => $orderId,
                'total'      => (float) $row['total'],
                'shipping'   => (float) $row['shipping'],
                'address'    => $row['customer_address'],
                'created_at' => $row['created_at'],
                'items'      => [],
            ];
        }

        // NULL means the LEFT JOIN found no line for this order.
        if ($row['product_id'] !== null) {
            $orders[$orderId]['items'][] = [
                'product_id' => (int) $row['product_id'],
                'name'       => $row['name'],
                'unit_price' => (float) $row['unit_price'],
                'quantity'   => (int) $row['quantity'],
            ];
        }
    }

    // array_values: json_encode turns an array with non-sequential keys into
    // a JSON OBJECT ({"12": {...}}) instead of an ARRAY ([{...}]).
    json_success(array_values($orders));
}


/**
 * Places an order from the account's server-side cart.
 */
function create_order(array $user): void
{
    $body = read_json_body();

    // ------------------------------------------------------------------
    // 1. The shipping address
    // ------------------------------------------------------------------
    $address = is_string($body['address'] ?? null) ? trim($body['address']) : '';

    if (text_length($address) < 5 || text_length($address) > 255) {
        // 255 is the size of the column: a longer value would be truncated by
        // MySQL, and a truncated address is an order that cannot be shipped.
        json_error('The shipping address must be between 5 and 255 characters.', 400);
    }

    // ------------------------------------------------------------------
    // 2. The ordered lines come from the CART, never from the request
    // ------------------------------------------------------------------
    // The cart is the account's own: the ids and quantities are read from
    // cart_items, joined with the products. The browser sends nothing here,
    // so it cannot add, remove or change a line or a price.
    $sql = 'SELECT p.id, p.name, p.price, p.discount_price, p.stock, ci.quantity
            FROM cart_items AS ci
            INNER JOIN products AS p ON p.id = ci.product_id
            WHERE ci.user_id = :user_id
            ORDER BY p.name ASC';

    try {
        $statement = db()->prepare($sql);
        $statement->execute(['user_id' => $user['id']]);
        $cart = $statement->fetchAll();
    } catch (PDOException $e) {
        error_log('[API orders] ' . $e->getMessage());
        json_error('Failed to read the cart', 500);
    }

    if ($cart === []) {
        json_error('Your cart is empty: there is nothing to order.', 400);
    }
    if (count($cart) > 20) {
        json_error('An order cannot contain more than 20 different products.', 400);
    }

    // ------------------------------------------------------------------
    // 3. The prices, read from the DATABASE, and the stock check
    // ------------------------------------------------------------------
    // This is the most important block of the project: the price used to
    // build the order comes from the database, never from the request. The
    // browser has no way of influencing the amount it will be charged.
    $lines = [];
    $subtotalCents = 0;

    foreach ($cart as $product) {
        $quantity = (int) $product['quantity'];
        $unitPrice = $product['discount_price'] === null
            ? (float) $product['price']
            : (float) $product['discount_price'];

        if ((int) $product['stock'] < $quantity) {
            // 409 Conflict: the request is perfectly valid, but the state of
            // the shop does not allow it. The product name and the remaining
            // quantity are included so the visitor knows which line to change.
            json_error(
                'Not enough stock for "' . $product['name'] . '" (only ' . (int) $product['stock'] . ' left).',
                409
            );
        }

        // Money is added in CENTS, as integers. With floating point numbers,
        // 0.1 + 0.2 is not exactly 0.3, and a total that differs from the sum
        // of its lines by one cent is a bug nobody forgives on an invoice.
        $unitPriceCents = (int) round($unitPrice * 100);
        $subtotalCents += $unitPriceCents * $quantity;

        $lines[] = [
            'product_id' => (int) $product['id'],
            'name'       => $product['name'],
            'unit_price' => number_format($unitPriceCents / 100, 2, '.', ''),
            'quantity'   => $quantity,
        ];
    }

    // ------------------------------------------------------------------
    // 4. Shipping fee, then the total
    // ------------------------------------------------------------------
    // Free shipping from 75.00 €, otherwise 4.95 €. Both are constants here so
    // the rule has a single place to change.
    $shippingCents = $subtotalCents >= 7500 ? 0 : 495;
    $totalCents = $subtotalCents + $shippingCents;

    // ------------------------------------------------------------------
    // 5. Writing everything, or nothing at all
    // ------------------------------------------------------------------
    $pdo = db();
    $orderId = 0;

    try {
        // BEGIN. From here on, every write belongs to the same transaction.
        $pdo->beginTransaction();

        $insertOrder = $pdo->prepare(
            'INSERT INTO orders (user_id, customer_name, customer_email, customer_address, shipping, total)
             VALUES (:user_id, :name, :email, :address, :shipping, :total)'
        );
        // The customer identity comes from the SESSION, not from the request
        // body: the browser cannot order in somebody else's name, even by
        // editing the JavaScript.
        $insertOrder->execute([
            'user_id'  => $user['id'],
            'name'     => $user['name'],
            'email'    => $user['email'],
            'address'  => $address,
            'shipping' => number_format($shippingCents / 100, 2, '.', ''),
            'total'    => number_format($totalCents / 100, 2, '.', ''),
        ]);

        $orderId = (int) $pdo->lastInsertId();

        $insertLine = $pdo->prepare(
            'INSERT INTO order_items (order_id, product_id, name, unit_price, quantity)
             VALUES (:order_id, :product_id, :name, :unit_price, :quantity)'
        );
        // :quantity appears twice in the same statement? No: the second
        // comparison uses its own placeholder. With real prepared statements
        // (ATTR_EMULATE_PREPARES is false) PDO refuses to see the same named
        // placeholder twice and answers SQLSTATE[HY093]. The same value is
        // therefore bound under two names.
        $updateStock = $pdo->prepare(
            'UPDATE products SET stock = stock - :quantity
             WHERE id = :product_id AND stock >= :stock_needed'
        );

        foreach ($lines as $line) {
            // The name and the price are copied into the line: this is the
            // snapshot that keeps the invoice readable in five years.
            $insertLine->execute([
                'order_id'    => $orderId,
                'product_id'  => $line['product_id'],
                'name'        => $line['name'],
                'unit_price'  => $line['unit_price'],
                'quantity'    => $line['quantity'],
            ]);

            // Stock is decremented in the same transaction. "AND stock >=
            // :quantity" is a second guard: if the stock dropped between the
            // check above and this line (two visitors ordering the last unit
            // at the same second), the UPDATE touches zero rows and we notice.
            $updateStock->execute([
                'quantity'    => $line['quantity'],
                'product_id'  => $line['product_id'],
                'stock_needed' => $line['quantity'],
            ]);

            if ($updateStock->rowCount() === 0) {
                throw new RuntimeException(
                    'Not enough stock for "' . $line['name'] . '": it changed while you were ordering.'
                );
            }
        }

        // The order is placed: the cart has served its purpose and is emptied
        // here, in the same transaction. If anything above failed, the ROLLBACK
        // keeps the cart intact so the visitor can try again.
        $clearCart = $pdo->prepare('DELETE FROM cart_items WHERE user_id = :user_id');
        $clearCart->execute(['user_id' => $user['id']]);

        // COMMIT. Everything written since BEGIN becomes permanent.
        $pdo->commit();
    } catch (PDOException $e) {
        // This block MUST come before the RuntimeException one below, and the
        // reason is worth remembering: PDOException extends RuntimeException.
        // With the RuntimeException block first, a SQL error was caught there,
        // and its raw message ("SQLSTATE[HY093]: Invalid parameter number")
        // was sent to the browser along with a 409 status. A catch order is
        // not cosmetic: the most specific type comes first.
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // A database error can reveal table names and SQL fragments, so it
        // goes to the log and the browser only gets a generic message.
        error_log('[API orders] ' . $e->getMessage());
        json_error('The order could not be created', 500);
    } catch (RuntimeException $e) {
        // ROLLBACK cancels every write since BEGIN. Without it, a failure on
        // the third line would leave an order with two lines, a total that
        // matches nothing, and stock that was never given back.
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // Here the message is ours (the stock changed while ordering), so it
        // is safe and useful to show it as is.
        json_error($e->getMessage(), 409);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[API orders] ' . $e->getMessage());
        json_error('The order could not be created', 500);
    }

    // 201 Created: a new resource now exists, and its id is returned so the
    // confirmation page can display it. The amounts PHP computed are returned
    // so the frontend can show a breakdown without recomputing anything.
    json_success([
        'order_id' => $orderId,
        'subtotal' => $subtotalCents / 100,
        'shipping' => $shippingCents / 100,
        'total'    => $totalCents / 100,
    ], 201);
}