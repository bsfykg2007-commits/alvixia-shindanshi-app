<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_method('POST');

$data = input();
$email = mb_strtolower(text_value($data, 'email', 254));
$password = (string)($data['password'] ?? '');
$stmt = db()->prepare('SELECT id, password_hash FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();
if (!$user || !password_verify($password, (string)$user['password_hash'])) {
    respond(['ok' => false, 'error' => 'メールアドレスまたはパスワードが違います。'], 401);
}
if (password_needs_rehash((string)$user['password_hash'], PASSWORD_DEFAULT)) {
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
}
session_regenerate_id(true);
$_SESSION['user_id'] = (int)$user['id'];
db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$user['id']]);
respond(['ok' => true, 'user' => current_user((int)$user['id'])]);
