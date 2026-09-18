<?php
/**
 * GET  /api/reviews.php?product_id=1   the reviews of one product (public)
 * POST /api/reviews.php                post a review for the logged-in account
 *
 * GET answers a few questions about a product: the list of its reviews, their
 * average rating and their count. It needs no account.
 *
 * POST needs an account and takes:
 *   { "product_id": 1, "rating": 5, "comment": "..." }
 * A customer can review a product only once; a second attempt answers 409.
 */

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    send_reviews();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = require_login();
    post_review($user);
}

header('Allow: GET, POST');
json_error('Method not allowed. Use GET or POST.', 405);


/** Sends the reviews of a product, with the average and the count. */
function send_reviews(): void
{
    $productId = isset($_GET['product_id']) ? (int) $_GET['product_id'] : 0;

    if ($productId <= 0) {
        json_error('Query parameter "product_id" is required and must be a positive integer.', 400);
    }

    try {
        $statement = db()->prepare('SELECT id FROM products WHERE id = :id');
        $statement->execute(['id' => $productId]);
        if ($statement->fetch() === false) {
            json_error('Product not found', 404);
        }
    } catch (PDOException $e) {
        error_log('[API reviews] ' . $e->getMessage());
        json_error('Failed to load the reviews', 500);
    }

    $sql = 'SELECT r.id, r.author_name, r.rating, r.comment, r.created_at
            FROM reviews AS r
            WHERE r.product_id = :product_id
            ORDER BY r.created_at DESC, r.id DESC';

    try {
        $statement = db()->prepare($sql);
        $statement->execute(['product_id' => $productId]);
        $rows = $statement->fetchAll();
    } catch (PDOException $e) {
        error_log('[API reviews] ' . $e->getMessage());
        json_error('Failed to load the reviews', 500);
    }

    $reviews = [];
    $totalRating = 0;

    foreach ($rows as $row) {
        $totalRating += (int) $row['rating'];
        $reviews[] = [
            'id'         => (int) $row['id'],
            'author_name' => $row['author_name'],
            'rating'     => (int) $row['rating'],
            'comment'    => $row['comment'],
            'created_at' => $row['created_at'],
        ];
    }

    json_success([
        'average' => $reviews === [] ? null : round($totalRating / count($reviews), 1),
        'count'   => count($reviews),
        'reviews' => $reviews,
    ]);
}


/** Stores a review for the logged-in account. */
function post_review(array $user): void
{
    $body = read_json_body();

    $productId = (int) ($body['product_id'] ?? 0);
    $rating    = (int) ($body['rating'] ?? 0);
    // comment is optional, but when present it must be readable text.
    $comment   = is_string($body['comment'] ?? null) ? trim($body['comment']) : '';

    if ($productId <= 0) {
        json_error('A valid product_id is required.', 400);
    }
    if ($rating < 1 || $rating > 5) {
        json_error('The rating must be between 1 and 5.', 400);
    }
    if ($comment !== '' && text_length($comment) > 1000) {
        json_error('The comment cannot exceed 1000 characters.', 400);
    }

    try {
        $statement = db()->prepare('SELECT id FROM products WHERE id = :id');
        $statement->execute(['id' => $productId]);
        if ($statement->fetch() === false) {
            json_error('This product does not exist.', 404);
        }

        // author_name is copied from the account, never read from the request:
        // a customer cannot sign a review with somebody else's name.
        $insert = db()->prepare(
            'INSERT INTO reviews (product_id, user_id, author_name, rating, comment)
             VALUES (:product, :user, :author, :rating, :comment)'
        );
        $insert->execute([
            'product' => $productId,
            'user'    => $user['id'],
            'author'  => $user['name'],
            'rating'  => $rating,
            'comment' => $comment === '' ? null : $comment,
        ]);
    } catch (PDOException $e) {
        // SQL error 1062 is "duplicate entry": this customer already reviewed
        // the product. The UNIQUE (product_id, user_id) key is the guarantee.
        if (($e->errorInfo[1] ?? null) === 1062) {
            json_error('You have already reviewed this product.', 409);
        }
        error_log('[API reviews] ' . $e->getMessage());
        json_error('The review could not be saved', 500);
    }

    // 201 Created: a new review now exists.
    json_success(null, 201);
}