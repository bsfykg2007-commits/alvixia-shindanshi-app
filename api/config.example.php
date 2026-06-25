<?php
declare(strict_types=1);

return [
    'dsn' => 'mysql:host=127.0.0.1;dbname=alvixia_shindanshi;charset=utf8mb4',
    'user' => 'alvixia_user',
    'password' => 'database-password',
    'session_name' => 'alvixia_shindanshi',
    'secure_cookie' => true,
    'app_url' => 'https://example.com/shindanshi',
    'smtp' => [
        'host' => 'sv0000.xserver.jp',
        'port' => 587,
        'encryption' => 'tls',
        'username' => 'noreply@alvixia.jp',
        'password' => 'mail-account-password',
        'from' => 'noreply@alvixia.jp',
        'from_name' => 'ALVIXIA 中小企業診断士試験対策',
        'return_path' => 'noreply@alvixia.jp',
    ],
];
