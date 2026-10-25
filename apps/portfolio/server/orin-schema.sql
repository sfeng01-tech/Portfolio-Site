-- Run once in the Neon SQL editor (or psql) against ORIN_DATABASE_URL.
BEGIN;
CREATE TABLE IF NOT EXISTS orin_digests (
  day date PRIMARY KEY,
  digest jsonb,
  source_status jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);
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
