-- Apply in the Neon SQL editor (or psql) against ORIN_DATABASE_URL. Every
-- statement is additive and the file is safe to re-run after new releases.
BEGIN;
CREATE TABLE IF NOT EXISTS orin_digests (
  day date PRIMARY KEY,
  digest jsonb,
  digest_status jsonb,
  source_status jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Existing deployments: add the run-level digest status without a table rebuild.
ALTER TABLE orin_digests ADD COLUMN IF NOT EXISTS digest_status jsonb;
CREATE TABLE IF NOT EXISTS orin_items (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  item jsonb NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  saved boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orin_digest_items (
  day date NOT NULL REFERENCES orin_digests(day) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES orin_items(id) ON DELETE CASCADE,
  PRIMARY KEY (day, item_id)
);
CREATE INDEX IF NOT EXISTS orin_saved_items ON orin_items (updated_at DESC) WHERE saved;
-- Lookup indexes for history suppression, taxonomy counts and feedback reads.
CREATE INDEX IF NOT EXISTS orin_digest_items_by_item ON orin_digest_items (item_id);
CREATE INDEX IF NOT EXISTS orin_items_category ON orin_items ((item->>'category')) WHERE item ? 'category';
CREATE INDEX IF NOT EXISTS orin_items_feedback ON orin_items ((item->>'feedback')) WHERE item ? 'feedback';
CREATE INDEX IF NOT EXISTS orin_items_paper_id ON orin_items ((item->>'paperId')) WHERE item ? 'paperId';
-- Server-side OAuth sessions. Only the SHA-256 hash of the browser cookie is
-- stored; the GitHub access token is AES-256-GCM encrypted with AUTH_SESSION_SECRET.
CREATE TABLE IF NOT EXISTS orin_auth_sessions (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  token_encrypted text NOT NULL,
  user_login text NOT NULL,
  user_data jsonb NOT NULL,
  scope text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS orin_auth_sessions_expiry ON orin_auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS orin_categories (
  label text PRIMARY KEY CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Seed the editable taxonomy with the standard classification tracks so items
-- can be model-assigned and grouped from the first run. Add or remove labels
-- freely; the collector and brain view read the table on every run.
INSERT INTO orin_categories (label)
VALUES ('GPU kernels'), ('Quantization'), ('Inference'), ('Training'), ('Agents'), ('AI hardware'), ('Research'), ('Reference Projects'), ('Books'), ('YouTube')
ON CONFLICT (label) DO NOTHING;
COMMIT;
-- Categories added later by hand (outside the API) must satisfy the label
-- check: no leading/trailing spaces, 1-80 characters.

-- ORIN notes and daily reminders (Google Docs-style private editor).
-- Content is sanitized HTML produced by the editor client.
BEGIN;
CREATE TABLE IF NOT EXISTS orin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
  content text NOT NULL DEFAULT '' CHECK (octet_length(content) <= 512000),
  word_count integer NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Every settled document state keeps its own row the editor can restore.
CREATE TABLE IF NOT EXISTS orin_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES orin_notes(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
  content text NOT NULL DEFAULT '' CHECK (octet_length(content) <= 512000),
  word_count integer NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  reason text NOT NULL CHECK (reason IN ('save', 'restore')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orin_note_versions_by_note
  ON orin_note_versions (note_id, created_at DESC);
-- Reminders repeat on selected weekdays or fire once on due_date at a fixed
-- clock time. The browser fires notifications and stamps last_fired_at.
CREATE TABLE IF NOT EXISTS orin_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  time_of_day time NOT NULL,
  days jsonb NOT NULL DEFAULT '["mon","tue","wed","thu","fri","sat","sun"]'::jsonb,
  due_date date,
  enabled boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Existing installations keep their weekday reminders and gain optional dates.
-- The Reminders API also repairs this one column for Render deployments that
-- have not re-run this file, if the ORIN database role owns the table.
ALTER TABLE orin_reminders ADD COLUMN IF NOT EXISTS due_date date;
COMMIT;

-- Private research workspace. Apply before starting the research worker.
-- The profile and options are copied into each job, so edits affect future runs.
BEGIN;
CREATE TABLE IF NOT EXISTS orin_research_profile (
  id smallint PRIMARY KEY CHECK (id = 1),
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A request ID lets an interrupted client safely retry one batch without
-- creating another set of billable jobs. The digest never contains credentials.
CREATE TABLE IF NOT EXISTS orin_research_batches (
  id uuid PRIMARY KEY,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orin_research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 1500),
  prompt text NOT NULL DEFAULT '' CHECK (char_length(prompt) <= 5000),
  sources jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(sources) = 'array'),
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'object'),
  result jsonb,
  progress text NOT NULL DEFAULT 'Waiting for research worker',
  error text,
  feedback jsonb,
  started_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  spent_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (spent_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orin_research_jobs_queue ON orin_research_jobs (created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS orin_research_jobs_lease ON orin_research_jobs (lease_expires_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS orin_research_jobs_history ON orin_research_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS orin_research_jobs_batch ON orin_research_jobs ((options->>'batchId'));
COMMIT;
