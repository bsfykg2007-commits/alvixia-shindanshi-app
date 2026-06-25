<?php
declare(strict_types=1);

return [
    'dsn' => 'mysql:host=127.0.0.1;dbname=alvixia_shindanshi;charset=utf8mb4',
    'user' => 'alvixia_user',
    'password' => '!]C&]T,~XbnP',
    'session_name' => 'alvixia_shindanshi',
    'secure_cookie' => true,
    'app_url' => 'https://alvixia.jp/shindanshi',
    'smtp' => [
        'host' => 'sv17067.xserver.jp',
        'port' => 587,
        'encryption' => 'tls',
        'username' => 'noreply@alvixia.jp',
        'password' => 'NoAlvixia',
        'from' => 'noreply@alvixia.jp',
        'from_name' => 'ALVIXIA 中小企業診断士試験対策',
        'return_path' => 'noreply@alvixia.jp',
    ],
];