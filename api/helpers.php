<?php
/**
 * Shared helpers for the whole API layer.
 *
 * Every endpoint requires this file, so every response has the same shape:
 *
 *   success : {"success": true,  "data": ...}
 *   error   : {"success": false, "error": "message"}
 *
 * The frontend only has to check one field ("success") to know whether the
 * request worked, which keeps the JavaScript error handling simple.
 */

require_once __DIR__ . '/../config/database.php';

/**
 * Sends a JSON response and stops the script.
 *
 * The exit is essential: without it PHP would keep executing and could print
 * HTML or a second JSON document after the first one, making the response
 * impossible to parse with response.json() in the browser.
 *
 * @param mixed $payload Data to encode, already shaped as the final answer.
 */
function json_response($payload, int $status = 200): void
{
    // The HTTP status code is what tells the browser if the request succeeded
    // (2xx) or failed in a specific way (400, 404, 405, 500).
    http_response_code($status);

    // Without this header the browser would treat the answer as HTML text.
    header('Content-Type: application/json; charset=utf-8');

    // JSON_UNESCAPED_UNICODE keeps "Décoration" readable instead of writing it
    // as "D\u00e9coration", which makes debugging in the Network tab easier.
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);

    exit;
}

/** Sends {"success": true, "data": ...}. */
function json_success($data, int $status = 200): void
{
    json_response(['success' => true, 'data' => $data], $status);
}

/** Sends {"success": false, "error": "..."}. */
function json_error(string $message, int $status = 400): void
{
    json_response(['success' => false, 'error' => $message], $status);
}

/**
 * Returns the shared PDO connection, or answers HTTP 500 if it is unavailable.
 *
 * HTTP 500 means "the server is broken", as opposed to 4xx which means "the
 * request was wrong". A bad database password is never the visitor's fault.
 */
function db(): PDO
{
    try {
        return getDatabase();
    } catch (PDOException $e) {
        // The technical message goes to the PHP log for you to read, while the
        // browser only receives a generic one: a database error can reveal
        // credentials, table names and SQL fragments.
        error_log('[API] ' . $e->getMessage());
        json_error('Database connection failed', 500);
    }
}

/**
 * Shapes a product row exactly as it should appear in JSON.
 *
 * MySQL returns DECIMAL columns as strings ("49.90") to preserve precision,
 * and returns integer columns as strings too on PHP versions older than 8.1.
 * Converting here means the browser always receives real numbers, regardless
 * of the PHP version, and can compute with them safely. In JavaScript, adding
 * a string and a number silently produces nonsense ("49.90" + 1 = "49.901").
 */
function cast_product_types(array $product): array
{
    $product['id']          = (int) $product['id'];
    $product['category_id'] = (int) $product['category_id'];
    $product['price']       = (float) $product['price'];
    $product['stock']       = (int) $product['stock'];

    return $product;
}
