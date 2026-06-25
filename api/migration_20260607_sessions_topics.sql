ALTER TABLE study_sessions
  ADD COLUMN subject_name VARCHAR(100) NOT NULL DEFAULT '' AFTER subject_id,
  ADD COLUMN topic VARCHAR(150) NOT NULL DEFAULT '' AFTER subject_name,
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER scoring_mode,
  ADD COLUMN accuracy DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER correct_count,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER started_at,
  MODIFY finished_at DATETIME NULL DEFAULT NULL,
  ADD KEY idx_sessions_topic (user_id, topic, updated_at);

UPDATE study_sessions
SET status = 'completed',
    accuracy = IF(answered_count > 0, ROUND(correct_count * 100 / answered_count, 2), 0)
WHERE finished_at IS NOT NULL;
