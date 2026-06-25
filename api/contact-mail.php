<?php
declare(strict_types=1);

function send_contact_received_mail(string $email, string $name = ''): bool
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $fromAddress = 'noreply@alvixia.jp';
    $fromName = 'ALVIXIA 中小企業診断士試験対策';
    $prefix = $name !== '' ? $name . " 様\n\n" : '';
    $body = $prefix
        . "お問い合わせを受け付けました。\n\n"
        . "内容を確認のうえ、必要に応じて担当者よりご連絡いたします。\n\n"
        . "このメールは自動送信です。\n";
    $subject = mb_encode_mimeheader('お問い合わせを受け付けました', 'UTF-8', 'B');
    $from = mb_encode_mimeheader($fromName, 'UTF-8', 'B') . ' <' . $fromAddress . '>';
    $headers = implode("\r\n", [
        'From: ' . $from,
        'Sender: ' . $fromAddress,
        'Return-Path: ' . $fromAddress,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ]);
    return mail($email, $subject, $body, $headers, '-f' . $fromAddress);
}
