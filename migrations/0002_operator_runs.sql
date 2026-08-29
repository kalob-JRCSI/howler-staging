-- HOWLER v0.9.5 operator persistence schema (Task 12; additive/expand-only).
-- Adds four new tables only. The six existing v0.9.4 tables, their triggers, and their data are
-- completely unchanged by this migration.

CREATE TABLE IF NOT EXISTS operator_intents (intent_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('FORECAST_QUERY','FORECAST_HEALTH_QUERY','RECOVERY_QUERY','EVIDENCE_PREVIEW','EVIDENCE_APPLY_SHADOW')), request_json TEXT NOT NULL, request_hash TEXT NOT NULL CHECK (length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'), created_at TEXT NOT NULL, UNIQUE (project_id, idempotency_key));

CREATE TRIGGER IF NOT EXISTS operator_intents_no_update BEFORE UPDATE ON operator_intents BEGIN SELECT RAISE(ABORT, 'operator_intents is immutable'); END;

CREATE TRIGGER IF NOT EXISTS operator_intents_no_delete BEFORE DELETE ON operator_intents BEGIN SELECT RAISE(ABORT, 'operator_intents is immutable'); END;

CREATE TABLE IF NOT EXISTS workflow_runs (workflow_id TEXT PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE, intent_hash TEXT NOT NULL CHECK (length(intent_hash) = 64 AND intent_hash NOT GLOB '*[^0-9a-f]*'), project_id TEXT NOT NULL, workflow_type TEXT NOT NULL CHECK (workflow_type = 'OPERATOR_INTENT_V1'), workflow_version INTEGER NOT NULL CHECK (workflow_version = 1), state TEXT NOT NULL CHECK (state IN ('RECEIVED','VALIDATING','READY','RUNNING','INTERRUPTED','BLOCKED','FAILED','SUCCEEDED')), current_step TEXT, attempt INTEGER NOT NULL CHECK (attempt >= 1), max_attempts INTEGER NOT NULL CHECK (max_attempts >= 1), resumable INTEGER NOT NULL CHECK (resumable IN (0,1)), interruption_json TEXT, blocked_reason_json TEXT, failure_json TEXT, result_id TEXT, created_at TEXT NOT NULL, started_at TEXT, updated_at TEXT NOT NULL, completed_at TEXT, FOREIGN KEY (intent_id) REFERENCES operator_intents(intent_id), CHECK (attempt <= max_attempts), CHECK ((state IN ('SUCCEEDED','BLOCKED','FAILED') AND result_id IS NOT NULL) OR (state NOT IN ('SUCCEEDED','BLOCKED','FAILED') AND result_id IS NULL)));

CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_state ON workflow_runs(project_id, state);

CREATE TABLE IF NOT EXISTS workflow_steps (workflow_id TEXT NOT NULL, step_name TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK (ordinal >= 0), state TEXT NOT NULL CHECK (state IN ('PENDING','RUNNING','SUCCEEDED','BLOCKED','FAILED','SKIPPED')), attempt INTEGER NOT NULL CHECK (attempt >= 1), input_hash TEXT NOT NULL CHECK (length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'), output_json TEXT, output_hash TEXT, problem_json TEXT, started_at TEXT, completed_at TEXT, PRIMARY KEY (workflow_id, step_name), FOREIGN KEY (workflow_id) REFERENCES workflow_runs(workflow_id));

CREATE TABLE IF NOT EXISTS workflow_results (result_id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL UNIQUE, intent_id TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('SUCCEEDED','BLOCKED','FAILED')), result_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (workflow_id) REFERENCES workflow_runs(workflow_id), FOREIGN KEY (intent_id) REFERENCES operator_intents(intent_id));

CREATE TRIGGER IF NOT EXISTS workflow_results_no_update BEFORE UPDATE ON workflow_results BEGIN SELECT RAISE(ABORT, 'workflow_results is immutable'); END;

CREATE TRIGGER IF NOT EXISTS workflow_results_no_delete BEFORE DELETE ON workflow_results BEGIN SELECT RAISE(ABORT, 'workflow_results is immutable'); END;

CREATE TRIGGER IF NOT EXISTS workflow_results_identity_guard BEFORE INSERT ON workflow_results BEGIN SELECT CASE WHEN (SELECT intent_id FROM workflow_runs WHERE workflow_id = NEW.workflow_id) <> NEW.intent_id THEN RAISE(ABORT, 'HOWLER_RESULT_INTENT_MISMATCH') WHEN (SELECT project_id FROM workflow_runs WHERE workflow_id = NEW.workflow_id) <> NEW.project_id THEN RAISE(ABORT, 'HOWLER_RESULT_PROJECT_MISMATCH') WHEN (SELECT state FROM workflow_runs WHERE workflow_id = NEW.workflow_id) <> NEW.status THEN RAISE(ABORT, 'HOWLER_RESULT_STATUS_MISMATCH') END; END;
