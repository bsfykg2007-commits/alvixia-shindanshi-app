<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mail.php';
require __DIR__ . '/password_reset_table.php';
require_method('POST');

$generic = ['ok' => true, 'message' => '登録済みのメールアドレスの場合、再設定メールを送信しました。'];
$data = input();
$email = mb_strtolower(text_value($data, 'email', 254));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond($generic);
}

try {
    $pdo = db();
    ensure_password_resets_table();
    $stmt = $pdo->prepare('SELECT id, email FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if ($user) {
        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')
            ->execute([(int)$user['id']]);
        $pdo->prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))')
            ->execute([(int)$user['id'], $tokenHash]);
        $resetId = (string)$pdo->lastInsertId();
        error_log('password reset token stored: reset_id=' . $resetId . ' user_id=' . (int)$user['id'] . ' expires=1h');
        $resetUrl = alvixia_app_url('index.html?reset_token=' . rawurlencode($token));
        if (!send_password_reset_mail((string)$user['email'], $resetUrl)) {
            error_log('password reset mail failed: to=' . (string)$user['email'] . ' reset_id=' . $resetId);
        }
    } else {
        error_log('password reset requested for unknown email: ' . $email);
    }
} catch (Throwable $e) {
    error_log('password reset request failed: ' . $e->getMessage());
    respond($generic);
}

respond($generic);
