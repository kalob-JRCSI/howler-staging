-- HOWLER v0.9.5 operator persistence schema (Task 12; additive/expand-only).
-- Adds four new tables only. The six existing v0.9.4 tables, their triggers, and their data are
-- completely unchanged by this migration.

CREATE TABLE IF NOT EXISTS operator_intents (intent_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('FORECAST_QUERY','FORECAST_HEALTH_QUERY','RECOVERY_QUERY','EVIDENCE_PREVIEW','EVIDENCE_APPLY_SHADOW')), request_json TEXT NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (project_id, idempotency_key));

CREATE TRIGGER IF NOT EXISTS operator_intents_no_update BEFORE UPDATE ON operator_intents BEGIN SELECT RAISE(ABORT, 'operator_intents is immutable'); END;

CREATE TRIGGER IF NOT EXISTS operator_intents_no_delete BEFORE DELETE ON operator_intents BEGIN SELECT RAISE(ABORT, 'operator_intents is immutable'); END;

CREATE TABLE IF NOT EXISTS workflow_runs (workflow_id TEXT PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE, intent_hash TEXT NOT NULL, project_id TEXT NOT NULL, workflow_type TEXT NOT NULL, workflow_version INTEGER NOT NULL, state TEXT NOT NULL CHECK (state IN ('RECEIVED','VALIDATING','READY','RUNNING','INTERRUPTED','BLOCKED','FAILED','SUCCEEDED')), current_step TEXT, attempt INTEGER NOT NULL, max_attempts INTEGER NOT NULL, resumable INTEGER NOT NULL CHECK (resumable IN (0,1)), interruption_json TEXT, blocked_reason_json TEXT, failure_json TEXT, result_id TEXT, created_at TEXT NOT NULL, started_at TEXT, updated_at TEXT NOT NULL, completed_at TEXT, FOREIGN KEY (intent_id) REFERENCES operator_intents(intent_id));

CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_state ON workflow_runs(project_id, state);

CREATE TABLE IF NOT EXISTS workflow_steps (workflow_id TEXT NOT NULL, step_name TEXT NOT NULL, ordinal INTEGER NOT NULL, state TEXT NOT NULL CHECK (state IN ('PENDING','RUNNING','SUCCEEDED','BLOCKED','FAILED','SKIPPED')), attempt INTEGER NOT NULL, input_hash TEXT NOT NULL, output_json TEXT, output_hash TEXT, problem_json TEXT, started_at TEXT, completed_at TEXT, PRIMARY KEY (workflow_id, step_name), FOREIGN KEY (workflow_id) REFERENCES workflow_runs(workflow_id));

CREATE TABLE IF NOT EXISTS workflow_results (result_id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL UNIQUE, intent_id TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('SUCCEEDED','BLOCKED','FAILED')), result_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (workflow_id) REFERENCES workflow_runs(workflow_id), FOREIGN KEY (intent_id) REFERENCES operator_intents(intent_id));

CREATE TRIGGER IF NOT EXISTS workflow_results_no_update BEFORE UPDATE ON workflow_results BEGIN SELECT RAISE(ABORT, 'workflow_results is immutable'); END;

CREATE TRIGGER IF NOT EXISTS workflow_results_no_delete BEFORE DELETE ON workflow_results BEGIN SELECT RAISE(ABORT, 'workflow_results is immutable'); END;
