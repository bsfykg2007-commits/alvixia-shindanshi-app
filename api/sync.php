<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_method('POST');

$userId = require_user();
$data = input();
$questions = is_array($data['questions'] ?? null) ? $data['questions'] : [];
$attempts = is_array($data['attempts'] ?? null) ? $data['attempts'] : [];
$sessions = is_array($data['sessions'] ?? null) ? $data['sessions'] : [];
$secondary = is_array($data['secondaryAnswers'] ?? null) ? $data['secondaryAnswers'] : [];
$scores = is_array($data['selfScores'] ?? null) ? $data['selfScores'] : [];
$prompts = is_array($data['aiPrompts'] ?? null) ? $data['aiPrompts'] : [];
$pdo = db();
$pdo->beginTransaction();

$stateStmt = $pdo->prepare(
    'INSERT INTO question_states
    (user_id, question_id, exam_year, subject_name, subject_id, topic, question_no, needs_review, bookmarked,
     last_answer, last_correct, attempts, correct_count, wrong_count, last_answered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))
    ON DUPLICATE KEY UPDATE
      exam_year=VALUES(exam_year), subject_name=VALUES(subject_name), subject_id=VALUES(subject_id),
      topic=VALUES(topic), question_no=VALUES(question_no),
      needs_review=GREATEST(needs_review, VALUES(needs_review)),
      bookmarked=GREATEST(bookmarked, VALUES(bookmarked)),
      last_answer=IF(VALUES(last_answered_at) >= COALESCE(last_answered_at, "1970-01-01"), VALUES(last_answer), last_answer),
      last_correct=IF(VALUES(last_answered_at) >= COALESCE(last_answered_at, "1970-01-01"), VALUES(last_correct), last_correct),
      attempts=GREATEST(attempts, VALUES(attempts)), correct_count=GREATEST(correct_count, VALUES(correct_count)),
      wrong_count=GREATEST(wrong_count, VALUES(wrong_count)),
      last_answered_at=GREATEST(COALESCE(last_answered_at, "1970-01-01"), VALUES(last_answered_at))'
);
foreach ($questions as $row) {
    if (!is_array($row) || empty($row['id'])) continue;
    $stateStmt->execute([
        $userId, mb_substr((string)$row['id'], 0, 191), mb_substr((string)($row['year'] ?? ''), 0, 32),
        mb_substr((string)($row['subject'] ?? ''), 0, 100), mb_substr((string)($row['subjectId'] ?? ''), 0, 50),
        infer_topic((string)($row['topic'] ?? ''), (string)($row['subject'] ?? ''), (string)($row['no'] ?? '')),
        mb_substr((string)($row['no'] ?? ''), 0, 50),
        !empty($row['review']) ? 1 : 0, !empty($row['bookmark']) ? 1 : 0,
        nullable_int($row['lastAnswer'] ?? null), array_key_exists('lastCorrect', $row) ? (!empty($row['lastCorrect']) ? 1 : 0) : null,
        (int)($row['attempts'] ?? 0), (int)($row['correct'] ?? 0), (int)($row['wrong'] ?? 0),
        (int)($row['lastAt'] ?? $row['updatedAt'] ?? 0),
    ]);
}

$attemptStmt = $pdo->prepare(
    'INSERT INTO answer_attempts
    (user_id, client_attempt_id, question_id, exam_year, subject_name, subject_id, topic, question_no,
     selected_answer, correct_answer, is_correct, points, earned_points, answered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))
    ON DUPLICATE KEY UPDATE client_attempt_id=client_attempt_id'
);
foreach ($attempts as $row) {
    if (!is_array($row) || empty($row['id']) || empty($row['questionId'])) continue;
    $correct = !empty($row['isCorrect']) ? 1 : 0;
    $points = (float)($row['points'] ?? 0);
    $attemptStmt->execute([
        $userId, mb_substr((string)$row['id'], 0, 100), mb_substr((string)$row['questionId'], 0, 191),
        mb_substr((string)($row['year'] ?? ''), 0, 32), mb_substr((string)($row['subject'] ?? ''), 0, 100),
        mb_substr((string)($row['subjectId'] ?? ''), 0, 50),
        infer_topic((string)($row['topic'] ?? ''), (string)($row['subject'] ?? ''), (string)($row['questionNo'] ?? '')),
        mb_substr((string)($row['questionNo'] ?? ''), 0, 50), nullable_int($row['selectedAnswer'] ?? null),
        nullable_int($row['correctAnswer'] ?? null), $correct, $points, $correct ? $points : 0,
        (int)($row['answeredAt'] ?? 0),
    ]);
}

$sessionStmt = $pdo->prepare(
    'INSERT INTO study_sessions
    (user_id, client_session_id, exam_year, subject_id, subject_name, topic, practice_mode, scoring_mode,
     status, question_count, answered_count, correct_count, accuracy, total_points, earned_points,
     started_at, updated_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000),
     FROM_UNIXTIME(? / 1000), IF(?="completed", FROM_UNIXTIME(? / 1000), NULL))
    ON DUPLICATE KEY UPDATE subject_name=VALUES(subject_name), topic=VALUES(topic),
     status=IF(status="completed", "completed", VALUES(status)),
     answered_count=GREATEST(answered_count, VALUES(answered_count)),
     correct_count=GREATEST(correct_count, VALUES(correct_count)), accuracy=VALUES(accuracy),
     total_points=VALUES(total_points), earned_points=GREATEST(earned_points, VALUES(earned_points)),
     updated_at=GREATEST(updated_at, VALUES(updated_at)),
     finished_at=IF(VALUES(status)="completed", COALESCE(VALUES(finished_at), finished_at, NOW()), finished_at)'
);
foreach ($sessions as $row) {
    if (!is_array($row) || empty($row['clientSessionId']) && empty($row['id'])) continue;
    $status = (string)($row['status'] ?? 'active');
    $subjectName = (string)($row['subjectName'] ?? '');
    $sessionStmt->execute([
        $userId, mb_substr((string)($row['clientSessionId'] ?? $row['id']), 0, 100),
        mb_substr((string)($row['yearId'] ?? ''), 0, 32), mb_substr((string)($row['subjectId'] ?? ''), 0, 50),
        mb_substr($subjectName, 0, 100), infer_topic((string)($row['topic'] ?? ''), $subjectName),
        mb_substr((string)($row['practice'] ?? ''), 0, 30), mb_substr((string)($row['mode'] ?? ''), 0, 30),
        mb_substr($status, 0, 20), (int)($row['questionCount'] ?? 0), (int)($row['answeredCount'] ?? 0),
        (int)($row['correctCount'] ?? 0), (float)($row['accuracy'] ?? 0), (float)($row['totalPoints'] ?? 0),
        (float)($row['earnedPoints'] ?? 0), (int)($row['startedAt'] ?? 0), (int)($row['updatedAt'] ?? 0),
        $status, (int)($row['finishedAt'] ?? $row['updatedAt'] ?? 0),
    ]);
}

$secondaryStmt = $pdo->prepare(
    'INSERT INTO secondary_answers (user_id, exam_year, case_id, question_id, slot_id, answer_text, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))
    ON DUPLICATE KEY UPDATE
      answer_text=IF(VALUES(updated_at) >= updated_at, VALUES(answer_text), answer_text),
      updated_at=GREATEST(updated_at, VALUES(updated_at))'
);
foreach ($secondary as $row) {
    if (!is_array($row) || empty($row['questionId'])) continue;
    $secondaryStmt->execute([
        $userId, mb_substr((string)($row['year'] ?? ''), 0, 32), mb_substr((string)($row['caseId'] ?? ''), 0, 50),
        mb_substr((string)$row['questionId'], 0, 100), mb_substr((string)($row['slotId'] ?? 'main'), 0, 50),
        (string)($row['text'] ?? ''), (int)($row['updatedAt'] ?? 0),
    ]);
}

$scoreStmt = $pdo->prepare(
    'INSERT INTO self_scores (user_id, exam_year, case_id, question_id, score, max_score, note, scored_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))
    ON DUPLICATE KEY UPDATE score=VALUES(score), max_score=VALUES(max_score), note=VALUES(note),
     scored_at=GREATEST(scored_at, VALUES(scored_at))'
);
foreach ($scores as $row) {
    if (!is_array($row) || empty($row['questionId'])) continue;
    $scoreStmt->execute([
        $userId, mb_substr((string)($row['year'] ?? ''), 0, 32), mb_substr((string)($row['caseId'] ?? ''), 0, 50),
        mb_substr((string)$row['questionId'], 0, 100), (float)($row['score'] ?? 0),
        (float)($row['maxScore'] ?? 0), mb_substr((string)($row['note'] ?? ''), 0, 4000),
        (int)($row['updatedAt'] ?? 0),
    ]);
}

$promptStmt = $pdo->prepare(
    'INSERT INTO ai_prompt_history
    (user_id, client_prompt_id, exam_year, case_id, question_id, provider, action_name, prompt_text, character_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))
    ON DUPLICATE KEY UPDATE client_prompt_id=client_prompt_id'
);
foreach ($prompts as $row) {
    if (!is_array($row) || empty($row['id'])) continue;
    $prompt = (string)($row['prompt'] ?? '');
    $promptStmt->execute([
        $userId, mb_substr((string)$row['id'], 0, 100), mb_substr((string)($row['year'] ?? ''), 0, 32),
        mb_substr((string)($row['caseId'] ?? ''), 0, 50), mb_substr((string)($row['questionId'] ?? ''), 0, 100),
        mb_substr((string)($row['provider'] ?? ''), 0, 30), mb_substr((string)($row['action'] ?? ''), 0, 30),
        $prompt, mb_strlen($prompt), (int)($row['createdAt'] ?? 0),
    ]);
}
$pdo->commit();
$statesStmt = $pdo->prepare(
    'SELECT question_id, exam_year, subject_name, subject_id, topic, question_no, needs_review, bookmarked,
     last_answer, last_correct, attempts, correct_count, wrong_count,
     UNIX_TIMESTAMP(last_answered_at) * 1000 AS last_at, UNIX_TIMESTAMP(updated_at) * 1000 AS updated_at
     FROM question_states WHERE user_id = ?'
);
$statesStmt->execute([$userId]);
$secondaryRowsStmt = $pdo->prepare(
    'SELECT exam_year, case_id, question_id, slot_id, answer_text,
     UNIX_TIMESTAMP(updated_at) * 1000 AS updated_at
     FROM secondary_answers WHERE user_id = ?'
);
$secondaryRowsStmt->execute([$userId]);
respond(['ok' => true, 'questions' => $statesStmt->fetchAll(), 'secondaryAnswers' => $secondaryRowsStmt->fetchAll()]);
