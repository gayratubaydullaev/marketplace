CREATE TABLE IF NOT EXISTS couriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    full_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','blocked')),
    vehicle_type TEXT NOT NULL DEFAULT 'bike',
    last_lat DOUBLE PRECISION,
    last_lng DOUBLE PRECISION,
    last_seen_at TIMESTAMPTZ,
    rating_avg NUMERIC(4,2) NOT NULL DEFAULT 0,
    rating_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS courier_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    courier_id UUID NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_shifts_open ON courier_shifts (courier_id, status) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS delivery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    order_id UUID NOT NULL,
    courier_id UUID REFERENCES couriers(id),
    status TEXT NOT NULL DEFAULT 'pending_assign'
        CHECK (status IN (
            'pending_assign','assigned','accepted','at_pickup','picked_up','in_transit',
            'delivered','cancelled','reassigned'
        )),
    pickup_address TEXT NOT NULL DEFAULT '',
    dropoff_address TEXT NOT NULL DEFAULT '',
    pickup_lat DOUBLE PRECISION,
    pickup_lng DOUBLE PRECISION,
    dropoff_lat DOUBLE PRECISION,
    dropoff_lng DOUBLE PRECISION,
    customer_name TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',
    vendor_id UUID,
    assigned_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    sequence INT NOT NULL DEFAULT 0,
    cod_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'UZS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_jobs_active_order
    ON delivery_jobs (tenant_id, order_id)
    WHERE status NOT IN ('delivered','cancelled');

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_courier_active
    ON delivery_jobs (courier_id, status)
    WHERE status IN ('assigned','accepted','at_pickup','picked_up','in_transit');

CREATE TABLE IF NOT EXISTS delivery_job_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    job_id UUID NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor_role TEXT NOT NULL DEFAULT '',
    actor_id TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    job_id UUID NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL,
    sender_id TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_messages_job ON delivery_messages (job_id, created_at);

CREATE TABLE IF NOT EXISTS courier_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    job_id UUID NOT NULL REFERENCES delivery_jobs(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    customer_id UUID,
    courier_id UUID NOT NULL REFERENCES couriers(id),
    score INT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id)
);

CREATE TABLE IF NOT EXISTS courier_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    courier_id UUID NOT NULL REFERENCES couriers(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'UZS',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
    paid_at TIMESTAMPTZ,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courier_payout_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    payout_id UUID NOT NULL REFERENCES courier_payouts(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES delivery_jobs(id),
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (payout_id, job_id)
);

ALTER TABLE couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_payout_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_couriers ON couriers
    USING (tenant_id::text = current_setting('app.current_tenant', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_courier_shifts ON courier_shifts
    USING (tenant_id::text = current_setting('app.current_tenant', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_delivery_jobs ON delivery_jobs
    USING (tenant_id::text = current_setting('app.current_tenant', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_delivery_job_events ON delivery_job_events
    USING (tenant_id::text = current_setting('app.current_tenant', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_delivery_messages ON delivery_messages
    USING (tenant_id::text = current_setting('app.current_tenant', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_courier_ratings ON courier_ratings
    USING (tenant_id::text = current_setting('app.current_tenant', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_courier_payouts ON courier_payouts
    USING (tenant_id::text = current_setting('app.current_tenant', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_courier_payout_items ON courier_payout_items
    USING (tenant_id::text = current_setting('app.current_tenant', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE couriers FORCE ROW LEVEL SECURITY;
ALTER TABLE courier_shifts FORCE ROW LEVEL SECURITY;
ALTER TABLE delivery_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE delivery_job_events FORCE ROW LEVEL SECURITY;
ALTER TABLE delivery_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE courier_ratings FORCE ROW LEVEL SECURITY;
ALTER TABLE courier_payouts FORCE ROW LEVEL SECURITY;
ALTER TABLE courier_payout_items FORCE ROW LEVEL SECURITY;
