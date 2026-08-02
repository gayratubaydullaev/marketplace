ALTER TABLE delivery_jobs
  ADD COLUMN IF NOT EXISTS cod_collected_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cod_dispute BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cod_dispute_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_cod_dispute ON delivery_jobs (tenant_id, cod_dispute)
  WHERE cod_dispute = true;
