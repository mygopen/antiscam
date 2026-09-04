CREATE TABLE IF NOT EXISTS ai_requests (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  day TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL,
  reserved INTEGER NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  result_status TEXT,
  risk_level TEXT
);
CREATE INDEX IF NOT EXISTS ai_daily_budget ON ai_requests(provider, day);
CREATE INDEX IF NOT EXISTS ai_concurrency ON ai_requests(provider, lease_until);
CREATE INDEX IF NOT EXISTS ai_rate ON ai_requests(provider, started_at);
CREATE INDEX IF NOT EXISTS ai_retention ON ai_requests(started_at);
CREATE TABLE IF NOT EXISTS ai_circuits (provider TEXT PRIMARY KEY, retry_at INTEGER NOT NULL);
