-- Harden reviews: uniqueness, moderation reason, helpful votes, indexes.

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Keep the newest review when duplicates exist.
DELETE FROM reviews a
USING reviews b
WHERE a.ctid < b.ctid
  AND a.tenant_id = b.tenant_id
  AND a.user_id = b.user_id
  AND a.product_id = b.product_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_user_product
  ON reviews (tenant_id, user_id, product_id);

CREATE INDEX IF NOT EXISTS idx_reviews_product_status
  ON reviews (tenant_id, product_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_vendor_status
  ON reviews (vendor_id, status, created_at DESC)
  WHERE vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_status_created
  ON reviews (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS review_helpful_votes (
  review_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (review_id, user_id)
);
