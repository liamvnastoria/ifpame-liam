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
 * Counts the length of a text sent by a visitor.
 *
 * mb_strlen() counts CHARACTERS and strlen() counts BYTES, and they disagree
 * as soon as a text contains an accent: "Écran" is 5 characters but 6 bytes.
 *
 * mb_strlen() lives in the mbstring extension, which is optional and not
 * installed everywhere. Rather than making the whole project refuse to run
 * on a PHP without it, we use the precise function when it is there, and fall
 * back to counting bytes otherwise. Counting bytes is never dangerous for a
 * maximum length: for UTF-8 text it always gives a number greater than or
 * equal to the character count, so a value accepted here always fits in the
 * column. The worst case is refusing a very long accented text, never storing
 * a truncated one.
 */
function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
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
 * MySQL returns DECIMAL columns as strings ("899.00") to preserve precision,
 * and returns integer columns as strings too on PHP versions older than 8.1.
 * Converting here means the browser always receives real numbers, regardless
 * of the PHP version, and can compute with them safely. In JavaScript, adding
 * a string and a number silently produces nonsense ("899.00" + 1 = "899.001").
 *
 * discount_price is special: NULL must STAY null, because it means "this
 * product is not on promotion". Casting it to float would turn it into 0.00
 * and the page would display a free product.
 */
function cast_product_types(array $product): array
{
    $product['id']             = (int) $product['id'];
    $product['category_id']    = (int) $product['category_id'];
    $product['price']          = (float) $product['price'];
    $product['discount_price'] = $product['discount_price'] === null
        ? null
        : (float) $product['discount_price'];
    $product['stock']          = (int) $product['stock'];
    // Only present in the list endpoint; the detail endpoint does not need it.
    if (isset($product['sold'])) {
        $product['sold'] = (int) $product['sold'];
    }

    return $product;
}

/**
 * Starts the PHP session, once per request.
 *
 * A session is two things: a file on the SERVER and a cookie in the browser
 * holding only its identifier. $_SESSION itself never leaves the server, so
 * the visitor cannot read or change what is inside. That is exactly why the
 * logged-in account id is stored there and not in the browser.
 */
function start_session(): void
{
    // Several helpers may call this function during one request, and calling
    // session_start() twice emits a PHP warning.
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_set_cookie_params([
        // JavaScript cannot read the cookie, so a script injected into the
        // page cannot steal the session with document.cookie.
        'httponly' => true,
        // The cookie is not sent when the request starts from another site:
        // that is the basic protection against a page on another domain
        // acting in the visitor's name.
        'samesite' => 'Lax',
        // 'secure' => true, // to add on a real HTTPS site, never on localhost
    ]);

    session_start();
}

/**
 * Returns the logged-in account (id, name, email), or null.
 *
 * password_hash is deliberately NOT selected: it has no reason to leave the
 * database, and a value that is never read can never be printed by mistake in
 * a JSON response.
 */
function current_user(): ?array
{
    start_session();

    if (!isset($_SESSION['user_id'])) {
        return null;
    }

    try {
        $statement = db()->prepare('SELECT id, name, email FROM users WHERE id = :id');
        $statement->execute(['id' => $_SESSION['user_id']]);
        $user = $statement->fetch();
    } catch (PDOException $e) {
        error_log('[API session] ' . $e->getMessage());
        json_error('Failed to load the account', 500);
    }

    if ($user === false) {
        // The account was deleted while the session was still open. The
        // session no longer means anything, so it is emptied here instead of
        // failing later in a confusing way.
        $_SESSION = [];
        return null;
    }

    $user['id'] = (int) $user['id'];

    return $user;
}

/**
 * Same as current_user(), but the request is refused with HTTP 401 when
 * nobody is logged in.
 *
 * 401 means "you are not authenticated" (or no longer are). 403 would mean
 * "we know who you are, and you are not allowed", which is a different
 * problem.
 */
function require_login(): array
{
    $user = current_user();

    if ($user === null) {
        json_error('You must be logged in to do this.', 401);
    }

    return $user;
}

/**
 * Reads the JSON body sent by fetch().
 *
 * php://input is the raw body of the request. $_POST is empty here and that
 * is expected: PHP only fills it for form-encoded bodies, never for a JSON
 * body, which is exactly why the frontend sends Content-Type: application/json.
 */
function read_json_body(): array
{
    $raw = file_get_contents('php://input');

    if ($raw === false || $raw === '') {
        json_error('The request body is empty: a JSON object was expected.', 400);
    }

    $data = json_decode($raw, true);

    // json_decode() returns null both when the JSON is invalid and when the
    // body is the literal "null": json_last_error() tells the two apart.
    if (json_last_error() !== JSON_ERROR_NONE) {
        json_error('The request body is not valid JSON.', 400);
    }

    if (!is_array($data)) {
        json_error('The request body must be a JSON object.', 400);
    }

    return $data;
}
