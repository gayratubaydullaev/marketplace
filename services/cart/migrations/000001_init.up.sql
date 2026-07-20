CREATE TABLE IF NOT EXISTS carts (
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
CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    vendor_id UUID,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(14,2) NOT NULL,
    title VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS addresses (
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
CREATE TABLE IF NOT EXISTS gift_certificates (
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
