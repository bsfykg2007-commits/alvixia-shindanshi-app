CREATE DATABASE IF NOT EXISTS alvixia_shindanshi
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE alvixia_shindanshi;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL DEFAULT '',
  rankings_opt_in TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_ranking (rankings_opt_in, created_at)
) ENGINE=InnoDB;

CREATE TABLE password_resets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_password_resets_token (token_hash),
  KEY idx_password_resets_user (user_id, used_at, expires_at),
  KEY idx_password_resets_expires (expires_at)
) ENGINE=InnoDB;

CREATE TABLE answer_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  client_attempt_id VARCHAR(100) NULL,
  question_id VARCHAR(191) NOT NULL,
  exam_year VARCHAR(32) NOT NULL DEFAULT '',
  subject_name VARCHAR(100) NOT NULL DEFAULT '',
  subject_id VARCHAR(50) NOT NULL DEFAULT '',
  topic VARCHAR(150) NOT NULL DEFAULT '',
  question_no VARCHAR(50) NOT NULL DEFAULT '',
  selected_answer SMALLINT NULL,
  correct_answer SMALLINT NULL,
  is_correct TINYINT(1) NOT NULL,
  points DECIMAL(7,2) NOT NULL DEFAULT 0,
  earned_points DECIMAL(7,2) NOT NULL DEFAULT 0,
  answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_attempt_client (user_id, client_attempt_id),
  KEY idx_attempts_user_date (user_id, answered_at),
  KEY idx_attempts_subject (user_id, subject_id, answered_at),
  KEY idx_attempts_year (user_id, exam_year, answered_at),
  KEY idx_attempts_topic (user_id, topic, answered_at),
  KEY idx_attempts_ranking (answered_at, is_correct, user_id)
) ENGINE=InnoDB;

CREATE TABLE question_states (
  user_id BIGINT UNSIGNED NOT NULL,
  question_id VARCHAR(191) NOT NULL,
  exam_year VARCHAR(32) NOT NULL DEFAULT '',
  subject_name VARCHAR(100) NOT NULL DEFAULT '',
  subject_id VARCHAR(50) NOT NULL DEFAULT '',
  topic VARCHAR(150) NOT NULL DEFAULT '',
  question_no VARCHAR(50) NOT NULL DEFAULT '',
  needs_review TINYINT(1) NOT NULL DEFAULT 0,
  bookmarked TINYINT(1) NOT NULL DEFAULT 0,
  last_answer SMALLINT NULL,
  last_correct TINYINT(1) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  correct_count INT UNSIGNED NOT NULL DEFAULT 0,
  wrong_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_answered_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, question_id),
  CONSTRAINT fk_states_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_states_review (user_id, needs_review, updated_at),
  KEY idx_states_bookmark (user_id, bookmarked, updated_at)
) ENGINE=InnoDB;

CREATE TABLE study_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  client_session_id VARCHAR(100) NOT NULL,
  exam_year VARCHAR(32) NOT NULL DEFAULT '',
  subject_id VARCHAR(50) NOT NULL DEFAULT '',
  subject_name VARCHAR(100) NOT NULL DEFAULT '',
  topic VARCHAR(150) NOT NULL DEFAULT '',
  practice_mode VARCHAR(30) NOT NULL DEFAULT '',
  scoring_mode VARCHAR(30) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  question_count INT UNSIGNED NOT NULL DEFAULT 0,
  answered_count INT UNSIGNED NOT NULL DEFAULT 0,
  correct_count INT UNSIGNED NOT NULL DEFAULT 0,
  accuracy DECIMAL(5,2) NOT NULL DEFAULT 0,
  total_points DECIMAL(8,2) NOT NULL DEFAULT 0,
  earned_points DECIMAL(8,2) NOT NULL DEFAULT 0,
  started_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_session_client (user_id, client_session_id),
  KEY idx_sessions_user_date (user_id, finished_at),
  KEY idx_sessions_topic (user_id, topic, updated_at),
  KEY idx_sessions_ranking (finished_at, earned_points, user_id)
) ENGINE=InnoDB;

CREATE TABLE secondary_answers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  exam_year VARCHAR(32) NOT NULL,
  case_id VARCHAR(50) NOT NULL,
  question_id VARCHAR(100) NOT NULL,
  slot_id VARCHAR(50) NOT NULL DEFAULT 'main',
  answer_text MEDIUMTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_secondary_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_secondary_answer (user_id, exam_year, case_id, question_id, slot_id),
  KEY idx_secondary_user_date (user_id, updated_at)
) ENGINE=InnoDB;

CREATE TABLE self_scores (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  exam_year VARCHAR(32) NOT NULL,
  case_id VARCHAR(50) NOT NULL,
  question_id VARCHAR(100) NOT NULL,
  score DECIMAL(6,2) NOT NULL,
  max_score DECIMAL(6,2) NOT NULL,
  note TEXT NOT NULL,
  scored_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_scores_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_self_score (user_id, exam_year, case_id, question_id),
  KEY idx_scores_user_date (user_id, scored_at),
  KEY idx_scores_ranking (exam_year, case_id, score, user_id)
) ENGINE=InnoDB;

CREATE TABLE ai_prompt_history (
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
