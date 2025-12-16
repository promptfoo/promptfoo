CREATE TABLE IF NOT EXISTS blob_assets (
  hash TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS blob_assets_provider_idx ON blob_assets(provider);
CREATE INDEX IF NOT EXISTS blob_assets_created_at_idx ON blob_assets(created_at);

CREATE TABLE IF NOT EXISTS blob_references (
  id TEXT PRIMARY KEY,
  blob_hash TEXT NOT NULL REFERENCES blob_assets(hash) ON DELETE CASCADE,
  eval_id TEXT NOT NULL REFERENCES evals(id) ON DELETE CASCADE,
  test_idx INTEGER,
  prompt_idx INTEGER,
  location TEXT,
  kind TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS blob_references_blob_idx ON blob_references(blob_hash);
CREATE INDEX IF NOT EXISTS blob_references_eval_idx ON blob_references(eval_id);
