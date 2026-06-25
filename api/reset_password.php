<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/password_reset_table.php';
require_method('POST');

$data = input();
$token = trim((string)($data['token'] ?? ''));
$password = (string)($data['password'] ?? '');

if ($token === '' || mb_strlen($password) < 8 || strlen($password) > 4096) {
    respond(['ok' => false, 'error' => '再設定URLまたは新しいパスワードを確認してください。'], 422);
}

$tokenHash = hash('sha256', $token);

try {
    $pdo = db();
    ensure_password_resets_table();
    $pdo->beginTransaction();
    $stmt = $pdo->prepare(
        'SELECT id, user_id FROM password_resets
         WHERE token_hash = ? AND used_at IS NULL AND expires_at >= NOW()
         ORDER BY id DESC LIMIT 1 FOR UPDATE'
    );
    $stmt->execute([$tokenHash]);
    $reset = $stmt->fetch();
    if (!$reset) {
        $pdo->rollBack();
        respond(['ok' => false, 'error' => '再設定URLの有効期限が切れているか、すでに使用されています。'], 422);
    }

    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), (int)$reset['user_id']]);
    $pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')
        ->execute([(int)$reset['user_id']]);
    $pdo->commit();
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respond(['ok' => false, 'error' => 'パスワードを再設定できませんでした。時間をおいて再度お試しください。'], 500);
}

respond(['ok' => true, 'message' => 'パスワードを再設定しました。新しいパスワードでログインしてください。']);
