ALTER TABLE vendors
  DROP COLUMN IF EXISTS rating_communication,
  DROP COLUMN IF EXISTS rating_quality,
  DROP COLUMN IF EXISTS rating_delivery;

ALTER TABLE reviews
  DROP COLUMN IF EXISTS score_communication,
  DROP COLUMN IF EXISTS score_quality,
  DROP COLUMN IF EXISTS score_delivery;
