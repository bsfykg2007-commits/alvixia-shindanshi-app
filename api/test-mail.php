<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mail.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo "method not allowed\n";
    exit;
}

header('Content-Type: text/plain; charset=utf-8');

// 一時的な送信先です。SMTP確認後、このファイルは削除してください。
$testTo = 'bsfykg2007@gmail.com';

$subject = 'ALVIXIA SMTP test mail';
$body = "ALVIXIAのSMTP送信テストです。\n"
    . "送信元: " . ALVIXIA_MAIL_FROM . "\n"
    . "送信時刻: " . date('Y-m-d H:i:s') . "\n";

$result = alvixia_send_member_mail($testTo, $subject, $body);

echo 'to: ' . $testTo . "\n";
echo 'smtp_result: ' . ($result ? 'true' : 'false') . "\n";