<?php
/**
 * Database connection settings.
 *
 * In a real production project these values would come from environment
 * variables and this file would never be committed with real credentials.
 * For a local school project they stay here: the goal is that you can change
 * the database name without searching through the whole codebase.
 */

// 127.0.0.1 instead of "localhost": with MySQL, "localhost" can make the
// client use a Unix socket rather than TCP, which fails on some Windows
// setups. 127.0.0.1 forces a plain TCP connection.
const DB_HOST    = '127.0.0.1';
const DB_NAME    = 'shop';
// The application does NOT connect as root. This account is created at the end
// of database/schema.sql: it may only read the catalogue, insert an order and
// update a stock, which is everything the API does. That file also explains
// why root would not work here on Debian or Ubuntu.
const DB_USER    = 'shop';
const DB_PASS    = 'shop_local';
const DB_CHARSET = 'utf8mb4';

/**
 * Builds the PDO connection.
 *
 * This function lets PDOException bubble up instead of answering an HTTP
 * error itself: deciding what a failure looks like on the wire is the job of
 * the API layer (see db() in api/helpers.php), not of this configuration file.
 */
function getDatabase(): PDO
{
    // "static" keeps the connection between calls: if several functions ask
    // for the database during the same request, only one connection is opened.
    static $pdo = null;

    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;

        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            // Exceptions instead of silent false returns: a failing query must
            // stop the endpoint, not produce an empty list that looks like
            // "there are no products".
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,

            // fetch() returns an associative array (column name => value),
            // which is also the shape json_encode() turns into JSON objects.
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,

            // Use real prepared statements on the MySQL server instead of
            // letting PDO build the SQL string itself. The query structure and
            // the values then travel separately, which is the whole point of
            // prepared statements.
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }

    return $pdo;
}
