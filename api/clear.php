<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_method('POST');

$userId = require_user();
$pdo = db();
$pdo->beginTransaction();
foreach (['answer_attempts', 'question_states', 'study_sessions'] as $table) {
    $pdo->prepare("DELETE FROM {$table} WHERE user_id = ?")->execute([$userId]);
}
$pdo->commit();
respond(['ok' => true]);
