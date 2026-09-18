<?php
/**
 * GET  /api/account.php  the profile of the logged-in account
 * POST /api/account.php  update the profile, or change the password
 *
 * POST body, chosen with the "action" field:
 *   { "action": "profile",  "name": "...", "email": "...", "address": "..." }
 *   { "action": "password", "current_password": "...", "new_password": "..." }
 *
 * Two actions on one endpoint keeps the frontend to a single file; the two
 * fields are clearly separated by the action instead of sharing one ambiguous
 * request. Both require the account, so require_login() runs before anything.
 */

require_once __DIR__ . '/helpers.php';

$user = require_login();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // account.php answers the same question as me.php but WITH the address,
    // which only the profile page needs. id, name and email are re-read here
    // so a just-updated profile shows its new values immediately.
    json_success([
        'id'      => $user['id'],
        'name'    => $user['name'],
        'email'   => $user['email'],
        'address' => $user['address'],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = read_json_body();
    $action = is_string($body['action'] ?? null) ? $body['action'] : '';

    if ($action === 'profile') {
        update_profile($user);
    } elseif ($action === 'password') {
        change_password($user);
    } else {
        json_error('The action must be "profile" or "password".', 400);
    }
}

header('Allow: GET, POST');
json_error('Method not allowed. Use GET or POST.', 405);


/**
 * Updates name, e-mail and address. The e-mail keeps its uniqueness rule, so
 * taking an address already used by another account is refused with 409.
 */
function update_profile(array $user): void
{
    $body = read_json_body();

    $name    = is_string($body['name'] ?? null) ? trim($body['name']) : '';
    $email   = is_string($body['email'] ?? null) ? strtolower(trim($body['email'])) : '';
    $address = is_string($body['address'] ?? null) ? trim($body['address']) : '';

    if (text_length($name) < 2 || text_length($name) > 100) {
        json_error('The name must be between 2 and 100 characters.', 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || text_length($email) > 150) {
        json_error('The e-mail address is not valid.', 400);
    }
    if ($address !== '' && text_length($address) > 255) {
        json_error('The address cannot exceed 255 characters.', 400);
    }

    try {
        $statement = db()->prepare(
            'UPDATE users SET name = :name, email = :email, address = :address WHERE id = :id'
        );
        $statement->execute([
            'name'    => $name,
            'email'   => $email,
            'address' => $address === '' ? null : $address,
            'id'      => $user['id'],
        ]);
    } catch (PDOException $e) {
        // 1062 is "duplicate entry": another account already uses this e-mail.
        if (($e->errorInfo[1] ?? null) === 1062) {
            json_error('This e-mail address is already registered.', 409);
        }
        error_log('[API account] ' . $e->getMessage());
        json_error('The profile could not be updated', 500);
    }

    json_success(['name' => $name, 'email' => $email, 'address' => $address]);
}


/**
 * Changes the password. The current password is checked first, because anyone
 * who reaches this endpoint must prove they know the password before it can be
 * replaced -- the session alone is not enough for a security-sensitive change.
 */
function change_password(array $user): void
{
    $body = read_json_body();

    $current = is_string($body['current_password'] ?? null) ? $body['current_password'] : '';
    $new     = is_string($body['new_password'] ?? null) ? $body['new_password'] : '';

    if (text_length($new) < 8 || text_length($new) > 72) {
        json_error('The new password must be between 8 and 72 characters.', 400);
    }

    try {
        $statement = db()->prepare('SELECT password_hash FROM users WHERE id = :id');
        $statement->execute(['id' => $user['id']]);
        $row = $statement->fetch();
    } catch (PDOException $e) {
        error_log('[API account] ' . $e->getMessage());
        json_error('The password could not be changed', 500);
    }

    if ($row === false || !password_verify($current, $row['password_hash'])) {
        json_error('The current password is incorrect.', 401);
    }

    try {
        $update = db()->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
        $update->execute(['hash' => password_hash($new, PASSWORD_DEFAULT), 'id' => $user['id']]);
    } catch (PDOException $e) {
        error_log('[API account] ' . $e->getMessage());
        json_error('The password could not be changed', 500);
    }

    json_success(null);
}