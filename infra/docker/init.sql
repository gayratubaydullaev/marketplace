-- Gayrat Marketplace schema (Uzbekistan)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('single_store', 'multi_vendor')),
    settings JSONB DEFAULT '{}',
    commission_rate DECIMAL(5,2) DEFAULT 10.00,
    default_locale VARCHAR(5) DEFAULT 'uz',
    default_currency VARCHAR(3) DEFAULT 'UZS',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    locale VARCHAR(5) DEFAULT 'uz',
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    otp_secret VARCHAR(64),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    translations JSONB DEFAULT '{}',
    logo_url VARCHAR(500),
    banner_url VARCHAR(500),
    commission_rate DECIMAL(5,2),
    stripe_account_id VARCHAR(255),
    payme_merchant_id VARCHAR(255),
    click_merchant_id VARCHAR(255),
    uzum_merchant_id VARCHAR(255),
    bank_details JSONB DEFAULT '{}',
    kyc_documents JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'pending',
    kyc_verified BOOLEAN DEFAULT FALSE,
    rating DECIMAL(2,1) DEFAULT 0.0,
    review_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    parent_id UUID REFERENCES categories(id),
    slug VARCHAR(255) NOT NULL,
    translations JSONB NOT NULL DEFAULT '{}',
    attributes_schema JSONB DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    vendor_id UUID REFERENCES vendors(id),
    category_id UUID NOT NULL REFERENCES categories(id),
    slug VARCHAR(500) NOT NULL,
    translations JSONB NOT NULL DEFAULT '{}',
    sku VARCHAR(100),
    price DECIMAL(14,2) NOT NULL,
    compare_at_price DECIMAL(14,2),
    cost_price DECIMAL(14,2),
    currency VARCHAR(3) DEFAULT 'UZS',
    inventory_quantity INTEGER DEFAULT 0,
    inventory_policy VARCHAR(20) DEFAULT 'deny',
    weight DECIMAL(10,2),
    weight_unit VARCHAR(10) DEFAULT 'kg',
    status VARCHAR(20) DEFAULT 'draft',
    is_featured BOOLEAN DEFAULT FALSE,
    seo JSONB DEFAULT '{}',
    attributes JSONB DEFAULT '{}',
    images JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    rating DECIMAL(2,1) DEFAULT 0.0,
    review_count INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    title VARCHAR(255),
    attributes JSONB DEFAULT '{}',
    price DECIMAL(14,2) NOT NULL,
    compare_at_price DECIMAL(14,2),
    inventory_quantity INTEGER DEFAULT 0,
    image_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, sku)
);

CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    guest_id VARCHAR(64),
    coupon_code VARCHAR(50),
    gift_certificate_code VARCHAR(50),
    currency VARCHAR(3) DEFAULT 'UZS',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    variant_id UUID,
    vendor_id UUID,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(14,2) NOT NULL,
    title VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('percent', 'fixed')),
    value DECIMAL(14,2) NOT NULL,
    min_order DECIMAL(14,2) DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',
    UNIQUE(tenant_id, code)
);

CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    label VARCHAR(50),
    full_name VARCHAR(200),
    phone VARCHAR(20),
    region VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    mahalla VARCHAR(100),
    street VARCHAR(255),
    building VARCHAR(50),
    apartment VARCHAR(50),
    postal_code VARCHAR(20),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    guest_email VARCHAR(255),
    order_number VARCHAR(32) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    payment_status VARCHAR(30) DEFAULT 'unpaid',
    fulfillment_status VARCHAR(30) DEFAULT 'unfulfilled',
    currency VARCHAR(3) DEFAULT 'UZS',
    subtotal DECIMAL(14,2) NOT NULL,
    discount DECIMAL(14,2) DEFAULT 0,
    shipping_cost DECIMAL(14,2) DEFAULT 0,
    tax_total DECIMAL(14,2) DEFAULT 0,
    total DECIMAL(14,2) NOT NULL,
    coupon_code VARCHAR(50),
    shipping_address JSONB NOT NULL DEFAULT '{}',
    billing_address JSONB DEFAULT '{}',
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, order_number)
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    vendor_id UUID,
    product_id UUID NOT NULL,
    variant_id UUID,
    title VARCHAR(500) NOT NULL,
    sku VARCHAR(100),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(14,2) NOT NULL,
    total_price DECIMAL(14,2) NOT NULL,
    commission_rate DECIMAL(5,2) DEFAULT 0,
    commission_amount DECIMAL(14,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'pending'
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    order_id UUID NOT NULL REFERENCES orders(id),
    user_id UUID,
    amount DECIMAL(14,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'UZS',
    provider VARCHAR(50) NOT NULL,
    provider_payment_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    payment_method VARCHAR(50),
    idempotency_key VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vendor_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    amount DECIMAL(14,2) NOT NULL,
    commission_total DECIMAL(14,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'UZS',
    status VARCHAR(20) DEFAULT 'pending',
    provider_transfer_id VARCHAR(255),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    vendor_id UUID,
    user_id UUID NOT NULL,
    order_id UUID,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(200),
    body TEXT,
    media JSONB DEFAULT '[]',
    vendor_reply TEXT,
    helpful_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    verified_purchase BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    channel VARCHAR(20) NOT NULL,
    type VARCHAR(50) NOT NULL,
    title JSONB DEFAULT '{}',
    body JSONB DEFAULT '{}',
    data JSONB DEFAULT '{}',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    uploader_id UUID,
    bucket VARCHAR(100) NOT NULL,
    object_key VARCHAR(500) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    content_type VARCHAR(100),
    size_bytes BIGINT,
    variants JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gift_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    balance DECIMAL(14,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'UZS',
    status VARCHAR(20) DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL UNIQUE,
    email BOOLEAN DEFAULT TRUE,
    sms BOOLEAN DEFAULT TRUE,
    push BOOLEAN DEFAULT TRUE,
    in_app BOOLEAN DEFAULT TRUE,
    order_updates BOOLEAN DEFAULT TRUE,
    promotions BOOLEAN DEFAULT FALSE,
    digest VARCHAR(20) DEFAULT 'instant',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    query TEXT NOT NULL,
    locale VARCHAR(5) DEFAULT 'uz',
    results_count INTEGER DEFAULT 0,
    user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    slug VARCHAR(100) NOT NULL,
    translations JSONB NOT NULL DEFAULT '{}',
    type VARCHAR(30) DEFAULT 'text',
    options JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE TABLE email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_tenant_status ON products(tenant_id, status);
CREATE INDEX idx_products_vendor ON products(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_featured ON products(tenant_id, is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_vendors_tenant_status ON vendors(tenant_id, status);
CREATE INDEX idx_carts_guest ON carts(guest_id);
CREATE INDEX idx_carts_user ON carts(user_id);

-- Seed default tenant (Uzbekistan marketplace)
INSERT INTO tenants (id, name, slug, mode, commission_rate, default_locale, default_currency, settings)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Gayrat Market',
    'gayrat',
    'multi_vendor',
    10.00,
    'uz',
    'UZS',
    '{"country":"UZ","phone_prefix":"+998","supported_locales":["uz","ru"],"payment_providers":["payme","click","uzum","stripe","bank_transfer"]}'
);

-- Admin password: Admin123! (bcrypt)
INSERT INTO users (id, tenant_id, email, password_hash, role, first_name, last_name, phone, locale, email_verified, status)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'admin@gayrat.uz',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZRGdjGj/n3.rsF.HqHqHqHqHqHqHq',
    'tenant_admin',
    'Admin',
    'Gayrat',
    '+998901234567',
    'uz',
    TRUE,
    'active'
);

INSERT INTO categories (id, tenant_id, slug, translations, sort_order)
VALUES
(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    'elektronika',
    '{"uz":{"name":"Elektronika","description":"Telefonlar, noutbuklar va gadjetlar"},"ru":{"name":"Электроника","description":"Телефоны, ноутбуки и гаджеты"}}',
    1
),
(
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    'kiyim',
    '{"uz":{"name":"Kiyim","description":"Erkaklar, ayollar va bolalar kiyimi"},"ru":{"name":"Одежда","description":"Мужская, женская и детская одежда"}}',
    2
),
(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000001',
    'uy-rozgor',
    '{"uz":{"name":"Uy-ro''zg''or","description":"Uy uchun mahsulotlar"},"ru":{"name":"Дом и быт","description":"Товары для дома"}}',
    3
);

-- RLS policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_products ON products
    USING (tenant_id::text = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_orders ON orders
    USING (tenant_id::text = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id::text = current_setting('app.current_tenant', true));

INSERT INTO gift_certificates (id, tenant_id, code, balance, currency, status)
VALUES (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000001',
    'GIFT50K',
    50000,
    'UZS',
    'active'
);

INSERT INTO coupons (id, tenant_id, code, type, value, min_order, max_uses, status, starts_at, ends_at)
VALUES (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000001',
    'WELCOME10',
    'percent',
    10,
    100000,
    1000,
    'active',
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '365 days'
);
