<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/contact-mail.php';
require_method('POST');

$data = input();
$email = mb_strtolower(text_value($data, 'email', 254));
$name = text_value($data, 'name', 100);

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['ok' => false, 'error' => 'メールアドレスを確認してください。'], 422);
}

send_contact_received_mail($email, $name);
respond(['ok' => true, 'message' => 'お問い合わせを受け付けました。']);
