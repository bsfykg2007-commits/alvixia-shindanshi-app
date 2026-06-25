<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_method('GET');

$id = user_id();
respond(['ok' => true, 'user' => $id ? current_user($id) : null]);
