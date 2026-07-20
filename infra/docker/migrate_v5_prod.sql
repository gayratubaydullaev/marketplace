-- Phase 5+: FX rates + Citus prep markers
CREATE TABLE IF NOT EXISTS fx_rates (
  base_currency VARCHAR(3) NOT NULL,
  quote_currency VARCHAR(3) NOT NULL,
  rate DECIMAL(18,8) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (base_currency, quote_currency)
);

INSERT INTO fx_rates (base_currency, quote_currency, rate) VALUES
('UZS','USD',0.000079),('UZS','EUR',0.000073),('UZS','RUB',0.0072)
ON CONFLICT DO NOTHING;

-- Citus is optional; ignore if extension unavailable
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS citus;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'citus extension not available: %', SQLERRM;
END $$;

-- Tenant delivery / SEO settings column if missing
DO $$ BEGIN
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS delivery_settings JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS seo_settings JSONB DEFAULT '{}'::jsonb;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;
