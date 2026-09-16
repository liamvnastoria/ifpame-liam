<?php
/**
 * POST /api/logout.php
 *
 * Closes the session: the server forgets the visitor and the browser throws
 * its cookie away.
 *
 * POST and not GET on purpose: a logout that works with a plain link could be
 * triggered by any image on any page (<img src="https://site/api/logout.php">),
 * which would disconnect the visitor without them ever asking for it.
 */

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed. Use POST.', 405);
}

start_session();

// Emptying the array clears the content of the session file on the server.
$_SESSION = [];

// The cookie in the browser has to go as well, otherwise it keeps being sent
// with every request for nothing. A date in the past tells the browser to
// delete it now.
if (ini_get('session.use_cookies')) {
    $cookie = session_get_cookie_params();

    setcookie(session_name(), '', [
        'expires' => time() - 42000,
        'path' => $cookie['path'],
        'domain' => $cookie['domain'],
        'secure' => $cookie['secure'],
        'httponly' => $cookie['httponly'],
        'samesite' => 'Lax',
    ]);
}

// Deletes the session file itself.
session_destroy();

// data is null: the operation succeeded and there is nothing to return.
json_success(null);
