-- Axis ratings used by reviews refreshVendorRating (FR-8.2).
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS rating_delivery DECIMAL(2,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_quality DECIMAL(2,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_communication DECIMAL(2,1) DEFAULT 0;
