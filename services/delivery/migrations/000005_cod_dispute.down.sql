DROP INDEX IF EXISTS idx_delivery_jobs_cod_dispute;
ALTER TABLE delivery_jobs
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS cod_dispute_note,
  DROP COLUMN IF EXISTS cod_dispute,
  DROP COLUMN IF EXISTS cod_collected_amount;
