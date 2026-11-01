-- ORIN Ask: library-grounded answers with citations.
-- Apply to a Neon development branch first, then production, using a direct
-- connection. Every statement is additive and the file is safe to re-run.
--
-- The vector column is why this lives apart from orin-schema.sql: a role that
-- cannot create the pgvector extension should not fail the core schema.
BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;

-- Passage-level index. Items and notes share one table so retrieval can rank
-- them together; source_id is the item hash or the note UUID as text.
CREATE TABLE IF NOT EXISTS orin_chunks (
  id text PRIMARY KEY,
  source_kind text NOT NULL CHECK (source_kind IN ('item', 'note')),
  source_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  title text NOT NULL DEFAULT '',
  text text NOT NULL,
  token_count integer NOT NULL CHECK (token_count >= 0),
  content_hash text NOT NULL,
  embedding_model text,
  embedding vector(1536),
  indexed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_id, ordinal)
);
CREATE INDEX IF NOT EXISTS orin_chunks_source ON orin_chunks (source_kind, source_id);
CREATE INDEX IF NOT EXISTS orin_chunks_fts ON orin_chunks
  USING gin (to_tsvector('english', title || ' ' || text));
-- HNSW keeps approximate semantic search fast without a training step.
CREATE INDEX IF NOT EXISTS orin_chunks_embedding ON orin_chunks
  USING hnsw (embedding vector_cosine_ops);

-- A conversation keeps its mode and source set so follow-ups stay grounded.
CREATE TABLE IF NOT EXISTS orin_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'library' CHECK (mode IN ('library', 'web', 'both')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orin_conversations_recent ON orin_conversations (updated_at DESC);

CREATE TABLE IF NOT EXISTS orin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES orin_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]',
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orin_messages_by_conversation ON orin_messages (conversation_id, created_at);

-- The exact passages an answer cited. source_id is intentionally not a foreign
-- key: notes and items live in different tables, and a deleted source should
-- leave the citation visible as unavailable rather than delete history.
CREATE TABLE IF NOT EXISTS orin_message_sources (
  message_id uuid NOT NULL REFERENCES orin_messages(id) ON DELETE CASCADE,
  ref integer NOT NULL CHECK (ref > 0),
  kind text NOT NULL CHECK (kind IN ('item', 'note')),
  source_id text NOT NULL,
  url text,
  title text NOT NULL DEFAULT '',
  snippet text NOT NULL DEFAULT '',
  score real,
  PRIMARY KEY (message_id, ref)
);
COMMIT;
