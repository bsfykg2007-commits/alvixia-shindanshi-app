<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;

require_once __DIR__ . '/vendor/PHPMailer/src/Exception.php';
require_once __DIR__ . '/vendor/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/vendor/PHPMailer/src/SMTP.php';

const ALVIXIA_MAIL_FROM = 'noreply@alvixia.jp';
const ALVIXIA_MAIL_FROM_NAME = 'ALVIXIA 中小企業診断士試験対策';

function alvixia_smtp_config(): array
{
    global $config;
    return (array)($config['smtp'] ?? []);
}

function alvixia_send_member_mail(string $to, string $subject, string $body): bool
{
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        error_log('alvixia smtp mail failed: to=invalid subject=' . $subject);
        return false;
    }

    $smtp = alvixia_smtp_config();
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->SMTPDebug = SMTP::DEBUG_OFF;
    $mail->Host = (string)($smtp['host'] ?? '');
    $mail->Port = (int)($smtp['port'] ?? 587);
    $mail->SMTPAuth = true;
    $mail->Username = (string)($smtp['username'] ?? ALVIXIA_MAIL_FROM);
    $mail->Password = (string)($smtp['password'] ?? '');
    $mail->SMTPSecure = (string)($smtp['encryption'] ?? PHPMailer::ENCRYPTION_STARTTLS);
    $mail->CharSet = 'UTF-8';
    $mail->Encoding = 'base64';
    $mail->Sender = (string)($smtp['return_path'] ?? ALVIXIA_MAIL_FROM);
    $mail->setFrom((string)($smtp['from'] ?? ALVIXIA_MAIL_FROM), (string)($smtp['from_name'] ?? ALVIXIA_MAIL_FROM_NAME));
    $mail->addAddress($to);
    $mail->isHTML(false);
    $mail->Subject = $subject;
    $mail->Body = $body;
    $mail->AltBody = $body;

    try {
        $sent = $mail->send();
    } catch (Throwable $e) {
        $sent = false;
        $mail->ErrorInfo = $e->getMessage();
    }
    if (!$sent) {
        error_log('alvixia smtp mail failed: to=' . $to . ' subject=' . $subject . ' error=' . $mail->ErrorInfo);
        return false;
    }

    error_log('alvixia smtp mail sent: to=' . $to . ' subject=' . $subject);
    return true;
}

function alvixia_app_url(string $path = ''): string
{
    global $config;
    $base = trim((string)($config['app_url'] ?? ''));
    if ($base === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $scheme = $https ? 'https' : 'http';
        $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
        $dir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/'))), '/');
        $baseDir = preg_replace('#/api$#', '', $dir) ?: '';
        $base = $scheme . '://' . $host . $baseDir;
    }
    return rtrim($base, '/') . '/' . ltrim($path, '/');
}

function send_registration_mail(string $email, string $displayName = ''): bool
{
    $name = $displayName !== '' ? $displayName . " 様\n\n" : '';
    $body = $name
        . "ALVIXIA 中小企業診断士試験対策への会員登録が完了しました。\n\n"
        . "学習履歴の保存や復習機能をご利用いただけます。\n\n"
        . "このメールに心当たりがない場合は、破棄してください。\n";
    return alvixia_send_member_mail($email, '会員登録が完了しました', $body);
}

function send_password_reset_mail(string $email, string $resetUrl): bool
{
    $body = "パスワード再設定の申請を受け付けました。\n\n"
        . "以下のURLから1時間以内に新しいパスワードを登録してください。\n"
        . $resetUrl . "\n\n"
        . "このメールに心当たりがない場合は、何もせず破棄してください。\n"
        . "現在のパスワードや新しいパスワードをメール本文でお知らせすることはありません。\n";
    return alvixia_send_member_mail($email, 'パスワード再設定のご案内', $body);
}
