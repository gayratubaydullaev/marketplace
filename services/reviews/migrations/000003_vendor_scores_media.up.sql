-- Review media is already JSONB; add multi-axis vendor scores (FR-8.2).

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS score_delivery INTEGER
    CHECK (score_delivery IS NULL OR (score_delivery BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS score_quality INTEGER
    CHECK (score_quality IS NULL OR (score_quality BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS score_communication INTEGER
    CHECK (score_communication IS NULL OR (score_communication BETWEEN 1 AND 5));

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS rating_delivery DECIMAL(2,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_quality DECIMAL(2,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_communication DECIMAL(2,1) DEFAULT 0;
