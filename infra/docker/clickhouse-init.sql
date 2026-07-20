CREATE DATABASE IF NOT EXISTS marketplace;

CREATE TABLE IF NOT EXISTS marketplace.events (
    event_time DateTime,
    tenant_id String,
    event_type String,
    user_id String,
    entity_id String,
    amount Decimal(14, 2),
    currency String,
    region String,
    metadata String
) ENGINE = MergeTree()
ORDER BY (tenant_id, event_time);

CREATE TABLE IF NOT EXISTS marketplace.order_facts (
    order_date Date,
    tenant_id String,
    vendor_id String,
    region String,
    orders_count UInt64,
    revenue Decimal(18, 2),
    commission Decimal(18, 2)
) ENGINE = SummingMergeTree()
ORDER BY (tenant_id, order_date, vendor_id, region);
