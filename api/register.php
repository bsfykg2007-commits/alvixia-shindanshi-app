<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mail.php';
require_method('POST');

$data = input();
$email = mb_strtolower(text_value($data, 'email', 254));
$password = (string)($data['password'] ?? '');
$displayName = text_value($data, 'displayName', 100);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['ok' => false, 'error' => 'メールアドレスを確認してください。'], 422);
}
if (mb_strlen($password) < 8 || strlen($password) > 4096) {
    respond(['ok' => false, 'error' => 'パスワードは8文字以上で入力してください。'], 422);
}

try {
    $stmt = db()->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)');
    $stmt->execute([$email, password_hash($password, PASSWORD_DEFAULT), $displayName]);
} catch (PDOException $e) {
    if ((string)$e->getCode() === '23000') {
        respond(['ok' => false, 'error' => 'このメールアドレスは登録済みです。'], 409);
    }
    throw $e;
}

session_regenerate_id(true);
$userId = (int)db()->lastInsertId();
$_SESSION['user_id'] = $userId;
if (!send_registration_mail($email, $displayName)) {
    error_log('registration mail failed');
}
respond(['ok' => true, 'user' => current_user((int)$_SESSION['user_id'])], 201);
