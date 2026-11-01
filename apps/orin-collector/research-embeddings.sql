-- Apply to a Neon development branch first, using a direct connection.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS orin_research_embeddings (
  item_id text PRIMARY KEY REFERENCES orin_items(id) ON DELETE CASCADE,
  embedding_model text NOT NULL,
  content_hash text NOT NULL,
  embedding vector(1536) NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now()
);
