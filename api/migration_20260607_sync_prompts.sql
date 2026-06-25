ALTER TABLE answer_attempts
  ADD COLUMN client_attempt_id VARCHAR(100) NULL AFTER user_id,
  ADD UNIQUE KEY uq_attempt_client (user_id, client_attempt_id);

CREATE TABLE IF NOT EXISTS ai_prompt_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  client_prompt_id VARCHAR(100) NOT NULL,
  exam_year VARCHAR(32) NOT NULL,
  case_id VARCHAR(50) NOT NULL,
  question_id VARCHAR(100) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  action_name VARCHAR(30) NOT NULL,
  prompt_text MEDIUMTEXT NOT NULL,
  character_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prompts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_prompt_client (user_id, client_prompt_id),
  KEY idx_prompts_user_date (user_id, created_at)
) ENGINE=InnoDB;
