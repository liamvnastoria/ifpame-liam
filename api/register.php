<?php
/**
 * POST /api/register.php
 *
 * Creates an account and logs it in straight away: asking the visitor to log
 * in again right after registering would be a pointless second step.
 *
 * Body: {"name": "...", "email": "...", "password": "..."}
 */

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed. Use POST.', 405);
}

$body = read_json_body();

// is_string() rather than a plain cast: a JSON array sent in "name" would
// trigger a PHP warning and store the word "Array" as a customer name.
$name     = is_string($body['name'] ?? null) ? trim($body['name']) : '';
// The address is stored in lower case: "Marie@Example.com" and
// "marie@example.com" must not become two different accounts.
// strtolower() is enough: see text_length() in helpers.php for why the mb_*
// functions are only used through a fallback.
$email    = is_string($body['email'] ?? null) ? strtolower(trim($body['email'])) : '';
// No trim() on the password: a space is a valid character, and removing it
// would silently change the password the visitor typed.
$password = is_string($body['password'] ?? null) ? $body['password'] : '';

// --- Validation. The frontend validates too, but it can be bypassed with the
// --- browser tools or with curl: this is the validation that counts.
if (text_length($name) < 2 || text_length($name) > 100) {
    json_error('The name must be between 2 and 100 characters.', 400);
}

// filter_var() uses PHP's own e-mail parser instead of a hand-written regex.
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || text_length($email) > 150) {
    json_error('The e-mail address is not valid.', 400);
}

// The upper limit is not decoration: bcrypt only uses the first 72 BYTES of a
// password and silently ignores the rest. Without this check, two different
// 90-character passwords would open the same account.
if (text_length($password) < 8 || text_length($password) > 72) {
    json_error('The password must be between 8 and 72 characters.', 400);
}

try {
    $pdo = db();

    $check = $pdo->prepare('SELECT id FROM users WHERE email = :email');
    $check->execute(['email' => $email]);
    if ($check->fetch() !== false) {
        // 409 Conflict: the request is well formed, but it clashes with the
        // current state of the database. 400 would blame the format of the
        // request, and the format is fine.
        json_error('This e-mail address is already registered.', 409);
    }

    // PASSWORD_DEFAULT asks PHP for its current best algorithm (bcrypt today).
    // The hash itself carries the algorithm and its cost, so a hash created
    // today stays verifiable even if PHP changes its default one day.
    $hash = password_hash($password, PASSWORD_DEFAULT);

    $insert = $pdo->prepare(
        'INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :hash)'
    );
    $insert->execute(['name' => $name, 'email' => $email, 'hash' => $hash]);

    $userId = (int) $pdo->lastInsertId();
} catch (PDOException $e) {
    // SQL error 1062 is "duplicate entry": two registrations with the same
    // address in the same second. The SELECT above gives a readable message
    // in the normal case, the UNIQUE index catches the race between them.
    if (($e->errorInfo[1] ?? null) === 1062) {
        json_error('This e-mail address is already registered.', 409);
    }

    error_log('[API register] ' . $e->getMessage());
    json_error('The account could not be created', 500);
}

// Logging in right after registering: the same session work as in login.php.
start_session();
session_regenerate_id(true);
$_SESSION['user_id'] = $userId;

// 201 Created: the request created a new resource, and its identifier is
// returned so the frontend can use it immediately.
json_success(['id' => $userId, 'name' => $name, 'email' => $email], 201);
