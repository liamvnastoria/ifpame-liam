<?php
/**
 * Pre-flight check of the development environment.
 *
 * Run by "npm run dev" before anything else starts. It is NEVER loaded by the
 * website itself: the API has no idea this file exists.
 *
 * WHY THIS FILE EXISTS
 * The API is deliberately silent about its technical problems. When the
 * database is unreachable, the browser only receives
 * {"success":false,"error":"Database connection failed"} while the real
 * message goes to the PHP log (see db() in api/helpers.php). That is the right
 * behaviour for a visitor and a painful one for a developer, because the page
 * simply looks broken.
 *
 * This script is the developer's side of that trade-off: it runs once, in the
 * terminal, and prints in plain words what is missing and what to type.
 *
 * Note on the language: the comments are in English like the rest of the
 * project, but the MESSAGES are in French because this file is read by a
 * developer in a terminal, not by a visitor in a browser.
 */

// The check reads the SAME configuration as the application instead of
// duplicating host, database name and credentials. Change
// config/database.php and this script follows automatically -- two sources of
// truth for a database connection is exactly how you waste an hour.
require_once __DIR__ . '/../config/database.php';

// The tables the application cannot work without. Listed here rather than
// discovered, because "the schema was never imported" is the mistake this
// check must catch by name.
const EXPECTED_TABLES = ['categories', 'products', 'users', 'orders', 'order_items'];

$problems = 0;

echo PHP_EOL;
echo '  Environnement : base "' . DB_NAME . '" sur ' . DB_HOST . PHP_EOL;
echo '  ' . str_repeat('-', 58) . PHP_EOL;

// ---------------------------------------------------------------------------
// 1. PHP version
// ---------------------------------------------------------------------------
if (PHP_VERSION_ID < 80100) {
    echo '  [ECHEC] PHP ' . PHP_VERSION . ' est trop ancien (8.1 minimum).' . PHP_EOL;
    $problems++;
} else {
    echo '  [ OK ] PHP ' . PHP_VERSION . PHP_EOL;
}

// ---------------------------------------------------------------------------
// 2. The MySQL driver
// ---------------------------------------------------------------------------
// pdo_mysql is a separate extension: "PDO" can be loaded while pdo_mysql is
// not, and that is the most common cause of "Database connection failed".
// Checked BEFORE trying to connect, so the message is about the real cause
// instead of the generic "could not find driver".
if (!extension_loaded('pdo_mysql')) {
    echo '  [ECHEC] extension pdo_mysql absente : PDO ne sait pas parler a MySQL.' . PHP_EOL;
    echo '          Sans elle, chaque appel a l\'API repond « Database connection failed ».' . PHP_EOL;
    echo '          Correction :  sudo apt install php8.4-mysql' . PHP_EOL;
    echo '          (puis redemarrer Apache si tu passes par Apache : sudo systemctl restart apache2)' . PHP_EOL;
    $problems++;
} else {
    echo '  [ OK ] extension pdo_mysql chargee' . PHP_EOL;
}

// ---------------------------------------------------------------------------
// 3. The connection itself
// ---------------------------------------------------------------------------
// getDatabase() is called directly, and NOT db() from helpers.php: db() answers
// an HTTP 500 and stops the script, which makes sense inside an API endpoint
// and none at all in a terminal. Here the PDOException must reach us so we can
// read the MySQL message -- the very message the browser never sees.
$pdo = null;

if (extension_loaded('pdo_mysql')) {
    try {
        $pdo = getDatabase();
        echo '  [ OK ] connexion MySQL reussie' . PHP_EOL;
    } catch (PDOException $exception) {
        echo '  [ECHEC] connexion MySQL impossible' . PHP_EOL;
        echo '          MySQL dit : ' . $exception->getMessage() . PHP_EOL;
        echo '          Correction :  ' . explain_pdo_error($exception->getMessage()) . PHP_EOL;
        $problems++;
    }
}

// ---------------------------------------------------------------------------
// 4. The tables
// ---------------------------------------------------------------------------
// A successful connection only proves the database exists. A database without
// the tables gives another, more confusing error: the API answers
// "Failed to load the products" because the query names a table that is not
// there.
if ($pdo !== null) {
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $missing = array_diff(EXPECTED_TABLES, $tables);

    if ($missing !== []) {
        echo '  [ECHEC] tables manquantes : ' . implode(', ', $missing) . PHP_EOL;
        echo '          Le fichier database/schema.sql n\'a pas ete importe.' . PHP_EOL;
        echo '          Correction :  sudo mysql < database/schema.sql' . PHP_EOL;
        echo '          ATTENTION : cette commande efface et recree la base "' . DB_NAME . '".' . PHP_EOL;
        $problems++;
    } else {
        echo '  [ OK ] les ' . count(EXPECTED_TABLES) . ' tables sont presentes' . PHP_EOL;

        // A catalogue of zero products is not a broken install, but it looks
        // exactly like one: empty rows, empty tiles, no error anywhere.
        $productCount = (int) $pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();

        if ($productCount === 0) {
            echo '  [ !  ] la table products est vide : le catalogue s\'affichera vide.' . PHP_EOL;
            echo '          Reimporte database/schema.sql pour retrouver les donnees de demonstration.' . PHP_EOL;
        } else {
            echo '  [ OK ] ' . $productCount . ' produits en catalogue' . PHP_EOL;
        }

        $userCount = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        echo '  [ OK ] ' . $userCount . ' compte(s) utilisateur' . PHP_EOL;
    }
}

// ---------------------------------------------------------------------------
// 5. The port the dev server wants to use
// ---------------------------------------------------------------------------
// The port is probed on 127.0.0.1 because that is exactly what "npm run serve"
// binds. Writing "php -S localhost:8000" would NOT do the same thing: on a
// machine where localhost resolves to IPv6 first, PHP listens on [::1] only and
// http://127.0.0.1:8000 answers "connection refused". An explicit address is
// always the same address; a name depends on the machine.
// Checked here rather than discovered by php -S: once php -S fails to bind,
// concurrently stops the CSS watcher too, and the two-line error mentions
// neither the cause nor the fix. A three-line check in a terminal is a better
// place to learn that a server is already running.
$socket = @fsockopen('127.0.0.1', 8000, $errorCode, $errorMessage, 0.3);

if ($socket !== false) {
    fclose($socket);
    echo '  [ECHEC] le port 8000 est deja utilise sur 127.0.0.1.' . PHP_EOL;
    echo '          Un autre "npm run dev" (ou un Apache configure sur 8000) tourne deja.' . PHP_EOL;
    echo '          Correction :  Ctrl+C dans l\'autre terminal, puis relance la commande.' . PHP_EOL;
    $problems++;
} else {
    echo '  [ OK ] port 8000 disponible' . PHP_EOL;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
echo '  ' . str_repeat('-', 58) . PHP_EOL;

if ($problems === 0) {
    echo '  Tout est pret. Le site va demarrer sur http://127.0.0.1:8000' . PHP_EOL;
    echo '  (http://localhost:8000 fonctionne aussi dans un navigateur)' . PHP_EOL . PHP_EOL;
    // Exit code 0 lets "npm run dev" continue with && and start the servers.
    exit(0);
}

echo '  ' . $problems . ' probleme(s) a corriger avant de lancer le site.' . PHP_EOL;
echo '  Pour travailler uniquement sur le CSS :  npm run css:watch' . PHP_EOL . PHP_EOL;
// A non-zero exit code stops the "&&" chain in npm run dev: refusing to start
// is better than serving a site whose every API call will fail.
exit(1);

/**
 * Turns a raw MySQL message into the cause, in one line.
 *
 * Matching on the message text is not elegant, but PDO gives no error code of
 * its own for these cases: the SQLSTATE is generic and the useful part is the
 * text. This is a diagnostic tool, never used to make a business decision.
 */
function explain_pdo_error(string $message): string
{
    if (str_contains($message, 'could not find driver')) {
        return 'sudo apt install php8.4-mysql';
    }
    if (str_contains($message, 'Connection refused') || str_contains($message, '[2002]')) {
        return 'demarrer le serveur :  sudo systemctl start mariadb';
    }
    if (str_contains($message, 'Unknown database')) {
        return 'importer le schema :  sudo mysql < database/schema.sql';
    }
    if (str_contains($message, 'Access denied')) {
        return 'verifier DB_USER et DB_PASS dans config/database.php, et que le compte "'
            . DB_USER . '" existe bien (dernier bloc de database/schema.sql)';
    }
    if (str_contains($message, 'No such file or directory')) {
        return 'garder DB_HOST a 127.0.0.1 plutot que localhost';
    }

    return 'lire le message MySQL ci-dessus';
}
