ALTER TABLE vendors
  DROP COLUMN IF EXISTS rating_communication,
  DROP COLUMN IF EXISTS rating_quality,
  DROP COLUMN IF EXISTS rating_delivery;
