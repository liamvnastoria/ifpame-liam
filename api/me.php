<?php
/**
 * GET /api/me.php
 *
 * Answers one question: who is logged in?
 *
 * Every page calls it on load, so the header can show either "Connexion" or
 * the name of the visitor.
 *
 * 200 with data:null when nobody is logged in, and NOT 401: asking who I am
 * is a valid question whose honest answer can be "nobody", so it is not an
 * error. An action that REQUIRES an account answers 401 instead (see
 * require_login()).
 */

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed. Use GET.', 405);
}

json_success(current_user());
