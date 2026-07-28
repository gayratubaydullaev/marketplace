DROP TABLE IF EXISTS review_helpful_votes;
DROP INDEX IF EXISTS idx_reviews_status_created;
DROP INDEX IF EXISTS idx_reviews_vendor_status;
DROP INDEX IF EXISTS idx_reviews_product_status;
DROP INDEX IF EXISTS idx_reviews_unique_user_product;
ALTER TABLE reviews DROP COLUMN IF EXISTS updated_at;
ALTER TABLE reviews DROP COLUMN IF EXISTS moderation_reason;
