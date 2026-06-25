<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_method('GET');

$userId = require_user();
$pdo = db();
$groupSql = static function (string $column) use ($pdo, $userId): array {
    $allowed = ['subject_name', 'exam_year'];
    if (!in_array($column, $allowed, true)) return [];
    $stmt = $pdo->prepare(
        "SELECT {$column} AS label, COUNT(*) AS attempts, SUM(is_correct) AS correct_count,
         ROUND(SUM(is_correct) * 100 / COUNT(*), 1) AS accuracy
         FROM answer_attempts WHERE user_id = ? GROUP BY {$column} ORDER BY attempts DESC, label"
    );
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
};

$recent = $pdo->prepare(
    'SELECT question_id, exam_year, subject_name, topic, question_no, selected_answer, correct_answer,
     is_correct, points, earned_points, answered_at
     FROM answer_attempts WHERE user_id = ? ORDER BY answered_at DESC, id DESC LIMIT 100'
);
$recent->execute([$userId]);
$recentRows = $recent->fetchAll();
foreach ($recentRows as &$row) {
    $row['topic'] = infer_topic((string)$row['topic'], (string)$row['subject_name'], (string)$row['question_no']);
}
unset($row);
$sessions = $pdo->prepare(
    'SELECT exam_year, subject_id, subject_name, topic, practice_mode, status, question_count,
     answered_count, correct_count, accuracy, total_points, earned_points, started_at, updated_at, finished_at
     FROM study_sessions WHERE user_id = ? ORDER BY COALESCE(finished_at, updated_at, started_at) DESC, id DESC LIMIT 50'
);
$sessions->execute([$userId]);
$sessionRows = $sessions->fetchAll();
foreach ($sessionRows as &$row) {
    $row['topic'] = infer_topic((string)$row['topic'], (string)$row['subject_name']);
    $row['accuracy'] = (float)$row['accuracy'] ?: ((int)$row['answered_count'] > 0
        ? round((int)$row['correct_count'] * 100 / (int)$row['answered_count'], 1) : 0);
}
unset($row);

$attempts = $pdo->prepare(
    'SELECT subject_name, exam_year, topic, question_no, is_correct
     FROM answer_attempts WHERE user_id = ?'
);
$attempts->execute([$userId]);
$topicGroups = [];
$weaknessGroups = [];
foreach ($attempts->fetchAll() as $row) {
    $topic = infer_topic((string)$row['topic'], (string)$row['subject_name'], (string)$row['question_no']);
    if (!isset($topicGroups[$topic])) $topicGroups[$topic] = ['label' => $topic, 'attempts' => 0, 'correct_count' => 0];
    $topicGroups[$topic]['attempts']++;
    $topicGroups[$topic]['correct_count'] += (int)$row['is_correct'];
    $key = (string)$row['subject_name'] . "\0" . $topic;
    if (!isset($weaknessGroups[$key])) {
        $weaknessGroups[$key] = ['subject_name' => $row['subject_name'], 'topic' => $topic, 'attempts' => 0, 'correct_count' => 0, 'wrong_count' => 0];
    }
    $weaknessGroups[$key]['attempts']++;
    $weaknessGroups[$key]['correct_count'] += (int)$row['is_correct'];
    $weaknessGroups[$key]['wrong_count'] += (int)!$row['is_correct'];
}
foreach ($topicGroups as &$row) $row['accuracy'] = round($row['correct_count'] * 100 / $row['attempts'], 1);
unset($row);
foreach ($weaknessGroups as &$row) $row['accuracy'] = round($row['correct_count'] * 100 / $row['attempts'], 1);
unset($row);
$topicRows = array_values($topicGroups);
usort($topicRows, static fn(array $a, array $b): int => $b['attempts'] <=> $a['attempts']);
$weaknessRows = array_values($weaknessGroups);
usort($weaknessRows, static fn(array $a, array $b): int => [$a['accuracy'], -$a['wrong_count']] <=> [$b['accuracy'], -$b['wrong_count']]);
$weaknessRows = array_slice($weaknessRows, 0, 20);
$secondary = $pdo->prepare(
    'SELECT a.exam_year, a.case_id, a.question_id, a.slot_id, a.answer_text,
     CHAR_LENGTH(a.answer_text) AS character_count, a.updated_at,
     s.score, s.max_score, s.note, s.scored_at
     FROM secondary_answers a
     LEFT JOIN self_scores s ON s.user_id=a.user_id AND s.exam_year=a.exam_year
       AND s.case_id=a.case_id AND s.question_id=a.question_id
     WHERE a.user_id = ? ORDER BY a.updated_at DESC LIMIT 100'
);
$secondary->execute([$userId]);
$prompts = $pdo->prepare(
    'SELECT exam_year, case_id, question_id, provider, action_name, prompt_text, character_count, created_at
     FROM ai_prompt_history WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100'
);
$prompts->execute([$userId]);

respond([
    'ok' => true,
    'accuracy' => [
        'subjects' => $groupSql('subject_name'),
        'years' => $groupSql('exam_year'),
        'topics' => $topicRows,
    ],
    'weaknesses' => $weaknessRows,
    'recentAnswers' => $recentRows,
    'sessions' => $sessionRows,
    'secondaryAnswers' => $secondary->fetchAll(),
    'aiPrompts' => $prompts->fetchAll(),
]);
