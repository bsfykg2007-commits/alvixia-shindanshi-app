<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_method('POST');

$userId = require_user();
$data = input();
$type = text_value($data, 'type', 30);
$pdo = db();

if ($type === 'answer') {
    [$questionId, $year, $subject, $subjectId, $topic, $questionNo] = question_meta($data);
    if ($questionId === '') respond(['ok' => false, 'error' => '問題IDが必要です。'], 422);
    $selected = nullable_int($data['selectedAnswer'] ?? null);
    $correctAnswer = nullable_int($data['correctAnswer'] ?? null);
    $correct = !empty($data['isCorrect']) ? 1 : 0;
    $points = (float)($data['points'] ?? 0);
    $earned = $correct ? $points : 0;
    $attemptId = text_value($data, 'attemptId', 100);
    $pdo->beginTransaction();
    $pdo->prepare(
        'INSERT INTO answer_attempts
        (user_id, client_attempt_id, question_id, exam_year, subject_name, subject_id, topic, question_no,
         selected_answer, correct_answer, is_correct, points, earned_points, answered_at)
        VALUES (?, NULLIF(?, ""), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))
        ON DUPLICATE KEY UPDATE client_attempt_id=client_attempt_id'
    )->execute([$userId, $attemptId, $questionId, $year, $subject, $subjectId, $topic, $questionNo,
        $selected, $correctAnswer, $correct, $points, $earned, (int)($data['answeredAt'] ?? round(microtime(true) * 1000))]);
    $inserted = $pdo->prepare('SELECT ROW_COUNT()');
    $inserted->execute();
    if ((int)$inserted->fetchColumn() === 0) {
        $pdo->commit();
        respond(['ok' => true, 'duplicate' => true]);
    }
    $pdo->prepare(
        'INSERT INTO question_states
        (user_id, question_id, exam_year, subject_name, subject_id, topic, question_no, last_answer, last_correct, attempts, correct_count, wrong_count, last_answered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          exam_year=VALUES(exam_year), subject_name=VALUES(subject_name), subject_id=VALUES(subject_id),
          topic=VALUES(topic), question_no=VALUES(question_no), last_answer=VALUES(last_answer),
          last_correct=VALUES(last_correct), attempts=attempts+1,
          correct_count=correct_count+VALUES(correct_count), wrong_count=wrong_count+VALUES(wrong_count),
          last_answered_at=NOW()'
    )->execute([$userId, $questionId, $year, $subject, $subjectId, $topic, $questionNo, $selected, $correct, $correct, $correct ? 0 : 1]);
    $pdo->commit();
    respond(['ok' => true]);
}

if ($type === 'question_state') {
    [$questionId, $year, $subject, $subjectId, $topic, $questionNo] = question_meta($data);
    if ($questionId === '') respond(['ok' => false, 'error' => '問題IDが必要です。'], 422);
    $review = !empty($data['needsReview']) ? 1 : 0;
    $bookmark = !empty($data['bookmarked']) ? 1 : 0;
    $pdo->prepare(
        'INSERT INTO question_states
        (user_id, question_id, exam_year, subject_name, subject_id, topic, question_no, needs_review, bookmarked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE exam_year=VALUES(exam_year), subject_name=VALUES(subject_name),
          subject_id=VALUES(subject_id), topic=VALUES(topic), question_no=VALUES(question_no),
          needs_review=VALUES(needs_review), bookmarked=VALUES(bookmarked)'
    )->execute([$userId, $questionId, $year, $subject, $subjectId, $topic, $questionNo, $review, $bookmark]);
    respond(['ok' => true]);
}

if ($type === 'session') {
    $clientId = text_value($data, 'clientSessionId', 100);
    if ($clientId === '') respond(['ok' => false, 'error' => 'セッションIDが必要です。'], 422);
    $pdo->prepare(
        'INSERT INTO study_sessions
        (user_id, client_session_id, exam_year, subject_id, subject_name, topic, practice_mode, scoring_mode,
         status, question_count, answered_count, correct_count, accuracy, total_points, earned_points,
         started_at, updated_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000),
         FROM_UNIXTIME(? / 1000), IF(? = "completed", FROM_UNIXTIME(? / 1000), NULL))
        ON DUPLICATE KEY UPDATE answered_count=VALUES(answered_count), correct_count=VALUES(correct_count),
          subject_name=VALUES(subject_name), topic=VALUES(topic),
          status=IF(status="completed", "completed", VALUES(status)),
          accuracy=VALUES(accuracy), total_points=VALUES(total_points), earned_points=VALUES(earned_points),
          updated_at=VALUES(updated_at),
          finished_at=IF(VALUES(status)="completed", COALESCE(finished_at, VALUES(finished_at), NOW()), finished_at)'
    )->execute([
        $userId, $clientId, text_value($data, 'yearId', 32), text_value($data, 'subjectId', 50),
        text_value($data, 'subjectName', 100),
        infer_topic(text_value($data, 'topic', 150), text_value($data, 'subjectName', 100)),
        text_value($data, 'practice', 30), text_value($data, 'mode', 30), text_value($data, 'status', 20) ?: 'active',
        (int)($data['questionCount'] ?? 0),
        (int)($data['answeredCount'] ?? 0), (int)($data['correctCount'] ?? 0),
        (float)($data['accuracy'] ?? 0),
        (float)($data['totalPoints'] ?? 0), (float)($data['earnedPoints'] ?? 0),
        (int)($data['startedAt'] ?? round(microtime(true) * 1000)),
        (int)($data['updatedAt'] ?? round(microtime(true) * 1000)),
        text_value($data, 'status', 20) ?: 'active',
        (int)($data['finishedAt'] ?? round(microtime(true) * 1000)),
    ]);
    respond(['ok' => true]);
}

if ($type === 'secondary_answer') {
    $pdo->prepare(
        'INSERT INTO secondary_answers (user_id, exam_year, case_id, question_id, slot_id, answer_text)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE answer_text=VALUES(answer_text)'
    )->execute([
        $userId, text_value($data, 'year', 32), text_value($data, 'caseId', 50),
        text_value($data, 'questionId', 100), text_value($data, 'slotId', 50) ?: 'main',
        (string)($data['text'] ?? ''),
    ]);
    respond(['ok' => true]);
}

if ($type === 'self_score') {
    $score = (float)($data['score'] ?? 0);
    $maxScore = (float)($data['maxScore'] ?? 0);
    if ($score < 0 || $maxScore <= 0 || $score > $maxScore) {
        respond(['ok' => false, 'error' => '採点値を確認してください。'], 422);
    }
    $pdo->prepare(
        'INSERT INTO self_scores (user_id, exam_year, case_id, question_id, score, max_score, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE score=VALUES(score), max_score=VALUES(max_score), note=VALUES(note), scored_at=NOW()'
    )->execute([
        $userId, text_value($data, 'year', 32), text_value($data, 'caseId', 50),
        text_value($data, 'questionId', 100), $score, $maxScore, text_value($data, 'note', 4000),
    ]);
    respond(['ok' => true]);
}

if ($type === 'ai_prompt') {
    $prompt = (string)($data['prompt'] ?? '');
    $pdo->prepare(
        'INSERT INTO ai_prompt_history
        (user_id, client_prompt_id, exam_year, case_id, question_id, provider, action_name, prompt_text, character_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))
        ON DUPLICATE KEY UPDATE client_prompt_id=client_prompt_id'
    )->execute([
        $userId, text_value($data, 'id', 100), text_value($data, 'year', 32),
        text_value($data, 'caseId', 50), text_value($data, 'questionId', 100),
        text_value($data, 'provider', 30), text_value($data, 'action', 30),
        $prompt, mb_strlen($prompt), (int)($data['createdAt'] ?? round(microtime(true) * 1000)),
    ]);
    respond(['ok' => true]);
}

respond(['ok' => false, 'error' => '保存種別が不正です。'], 422);
