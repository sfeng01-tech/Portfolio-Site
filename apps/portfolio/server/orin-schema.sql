-- Run once in the Neon SQL editor (or psql) against ORIN_DATABASE_URL.
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
VALUES ('GPU kernels'), ('Quantization'), ('Inference'), ('Training'), ('Agents'), ('AI hardware'), ('Research')
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
-- Daily reminders repeat on selected weekdays at a fixed clock time. The
-- browser fires the notification and stamps last_fired_at so a reload cannot
-- ring the same reminder twice; the table is the source of truth.
CREATE TABLE IF NOT EXISTS orin_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  time_of_day time NOT NULL,
  days jsonb NOT NULL DEFAULT '["mon","tue","wed","thu","fri","sat","sun"]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
