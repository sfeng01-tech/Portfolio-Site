-- Apply only to an isolated pilot database, using a direct connection.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS orin_hybrid_pilot_items (
  item_id text PRIMARY KEY,
  title text NOT NULL,
  excerpt text NOT NULL,
  source text NOT NULL,
  embedding_model text NOT NULL,
  content_hash text NOT NULL,
  embedding vector(1536) NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now()
);
