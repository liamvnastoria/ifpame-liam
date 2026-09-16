<?php
/**
 * POST /api/login.php
 *
 * Checks an e-mail address and a password, and opens a session.
 *
 * Body: {"email": "...", "password": "..."}
 */

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed. Use POST.', 405);
}

$body = read_json_body();

// strtolower() and not mb_strtolower(): an address accepted by
// FILTER_VALIDATE_EMAIL is ASCII, so lowering it needs no extra extension.
// The point is that "Marie@Example.com" finds the same account as
// "marie@example.com".
$email    = is_string($body['email'] ?? null) ? strtolower(trim($body['email'])) : '';
$password = is_string($body['password'] ?? null) ? $body['password'] : '';

if ($email === '' || $password === '') {
    json_error('The e-mail address and the password are required.', 400);
}

try {
    // password_hash is selected HERE, and only here: it is the one place that
    // needs to compare it with what the visitor typed.
    $statement = db()->prepare('SELECT id, name, email, password_hash FROM users WHERE email = :email');
    $statement->execute(['email' => $email]);
    $user = $statement->fetch();
} catch (PDOException $e) {
    error_log('[API login] ' . $e->getMessage());
    json_error('The login could not be checked', 500);
}

// One single answer for "this address does not exist" and for "the password
// is wrong". Saying which of the two is wrong would let anyone test addresses
// one by one to find out who has an account here.
$credentialsAreWrong = $user === false || !password_verify($password, $user['password_hash']);

if ($credentialsAreWrong) {
    // 401: the credentials do not authenticate anybody.
    json_error('E-mail address or password is incorrect.', 401);
}

start_session();

// A session id given before the login must not survive it. Without this line,
// an attacker who managed to fix the visitor's session id beforehand would
// keep using it after the login -- the classic "session fixation" attack.
session_regenerate_id(true);

// Only the identifier is stored. The name and e-mail are re-read from the
// database on each request, so a renamed account shows its new name at once.
$_SESSION['user_id'] = (int) $user['id'];

json_success([
    'id' => (int) $user['id'],
    'name' => $user['name'],
    'email' => $user['email'],
]);
