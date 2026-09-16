<?php
/**
 * GET  /api/orders.php   the order history of the logged-in account
 * POST /api/orders.php   create an order for the logged-in account
 *
 * Two methods on the same URL on purpose: "the orders" is one resource. GET
 * reads it, POST adds to it. There is no endpoint to read someone else's
 * orders, because the account always comes from the session.
 *
 * Body of the POST (nothing else is accepted -- in particular, no price):
 *   { "address": "12 rue des Tilleuls, 5000 Namur",
 *     "items": [ { "product_id": 3, "quantity": 2 }, ... ] }
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
 * Sends the order history of one account, newest first.
 */
function send_order_history(array $user): void
{
    $sql = 'SELECT o.id, o.total, o.created_at,
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
                'id' => $orderId,
                'total' => (float) $row['total'],
                'created_at' => $row['created_at'],
                'items' => [],
            ];
        }

        // NULL means the LEFT JOIN found no line for this order.
        if ($row['product_id'] !== null) {
            $orders[$orderId]['items'][] = [
                'product_id' => (int) $row['product_id'],
                'name' => $row['name'],
                'unit_price' => (float) $row['unit_price'],
                'quantity' => (int) $row['quantity'],
            ];
        }
    }

    // array_values: json_encode turns an array with non-sequential keys into
    // a JSON OBJECT ({"12": {...}}) instead of an ARRAY ([{...}]).
    json_success(array_values($orders));
}


/**
 * Creates an order for the logged-in account.
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
    // 2. The ordered lines: only ids and quantities, never any price
    // ------------------------------------------------------------------
    $items = is_array($body['items'] ?? null) ? $body['items'] : [];

    if ($items === []) {
        json_error('The order must contain at least one product.', 400);
    }
    if (count($items) > 20) {
        json_error('An order cannot contain more than 20 different products.', 400);
    }

    $quantities = [];

    foreach ($items as $item) {
        if (!is_array($item)) {
            json_error('Every order line must be an object.', 400);
        }

        $productId = (int) ($item['product_id'] ?? 0);
        $quantity = (int) ($item['quantity'] ?? 0);

        if ($productId <= 0) {
            json_error('Every order line needs a valid product_id.', 400);
        }
        if ($quantity < 1 || $quantity > 99) {
            json_error('A quantity must be between 1 and 99.', 400);
        }
        // The cart cannot send the same product twice (it is keyed by product
        // id), so a duplicate means the request was written by hand. Refusing
        // it is clearer than silently adding the two lines up.
        if (array_key_exists($productId, $quantities)) {
            json_error('The same product appears twice in the order.', 400);
        }

        $quantities[$productId] = $quantity;
    }

    // ------------------------------------------------------------------
    // 3. Re-reading the products from the database
    // ------------------------------------------------------------------
    // The IN list is built from the NUMBER of ids, never from their values,
    // and each id is still a bound parameter. Sorting the ids also makes the
    // SQL text identical from one request to the next for the same products,
    // which is what lets MySQL reuse its prepared statement.
    $ids = array_keys($quantities);
    sort($ids);

    $placeholders = [];
    $parameters = [];
    foreach ($ids as $index => $productId) {
        $placeholders[] = ':product' . $index;
        $parameters['product' . $index] = $productId;
    }

    $sql = 'SELECT p.id, p.name, p.price, p.discount_price, p.stock
            FROM products AS p
            WHERE p.id IN (' . implode(', ', $placeholders) . ')';

    try {
        $statement = db()->prepare($sql);
        $statement->execute($parameters);
        $products = $statement->fetchAll();
    } catch (PDOException $e) {
        error_log('[API orders] ' . $e->getMessage());
        json_error('Failed to check the products', 500);
    }

    // An id that matches no row means the catalogue changed or the request was
    // invented. Either way, the order must not be created with a missing line.
    if (count($products) !== count($ids)) {
        json_error('One of the ordered products does not exist.', 404);
    }

    // ------------------------------------------------------------------
    // 4. The prices, read from the DATABASE
    // ------------------------------------------------------------------
    // This is the most important block of the project: the price used to
    // build the order comes from the database, never from the request. The
    // browser has no way of influencing the amount it will be charged.
    $lines = [];
    $totalCents = 0;

    foreach ($products as $product) {
        $quantity = $quantities[(int) $product['id']];
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
        $totalCents += $unitPriceCents * $quantity;

        $lines[] = [
            'product_id' => (int) $product['id'],
            'name' => $product['name'],
            'unit_price' => number_format($unitPriceCents / 100, 2, '.', ''),
            'quantity' => $quantity,
        ];
    }

    // ------------------------------------------------------------------
    // 5. Writing everything, or nothing at all
    // ------------------------------------------------------------------
    $pdo = db();
    $orderId = 0;

    try {
        // BEGIN. From here on, every write belongs to the same transaction.
        $pdo->beginTransaction();

        $insertOrder = $pdo->prepare(
            'INSERT INTO orders (user_id, customer_name, customer_email, customer_address, total)
             VALUES (:user_id, :name, :email, :address, :total)'
        );
        // The customer identity comes from the SESSION, not from the request
        // body: the browser cannot order in somebody else's name, even by
        // editing the JavaScript.
        $insertOrder->execute([
            'user_id' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'address' => $address,
            'total' => number_format($totalCents / 100, 2, '.', ''),
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
                'order_id' => $orderId,
                'product_id' => $line['product_id'],
                'name' => $line['name'],
                'unit_price' => $line['unit_price'],
                'quantity' => $line['quantity'],
            ]);

            // Stock is decremented in the same transaction. "AND stock >=
            // :quantity" is a second guard: if the stock dropped between the
            // check above and this line (two visitors ordering the last unit
            // at the same second), the UPDATE touches zero rows and we notice.
            $updateStock->execute([
                'quantity' => $line['quantity'],
                'product_id' => $line['product_id'],
                'stock_needed' => $line['quantity'],
            ]);

            if ($updateStock->rowCount() === 0) {
                throw new RuntimeException(
                    'Not enough stock for "' . $line['name'] . '": it changed while you were ordering.'
                );
            }
        }

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
    // confirmation page can display it.
    json_success([
        'order_id' => $orderId,
        'total' => $totalCents / 100,
    ], 201);
}
