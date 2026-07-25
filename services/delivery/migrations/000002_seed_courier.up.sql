-- Demo courier: courier@gayrat.uz / Courier123!
-- Password hash: bcrypt cost 10
DO $$
DECLARE
  tid UUID := '00000000-0000-0000-0000-000000000001';
  uid UUID := '00000000-0000-0000-0000-0000000000c1';
  cid UUID := '00000000-0000-0000-0000-0000000000c2';
BEGIN
  IF to_regclass('couriers') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO users (id, tenant_id, email, password_hash, role, first_name, last_name, phone, locale, email_verified, status)
  VALUES (
    uid, tid, 'courier@gayrat.uz',
    '$2b$10$VWWIH9nJy9Wmuqw6YmbsNuSOLFjNJe/vBb4OjCx76eEU70TdUKkTe',
    'courier', 'Jasur', 'Kuryer', '+998901000777', 'uz', TRUE, 'active'
  )
  ON CONFLICT (tenant_id, email) DO UPDATE SET
    role = 'courier',
    password_hash = EXCLUDED.password_hash,
    status = 'active',
    updated_at = NOW();

  SELECT id INTO uid FROM users WHERE tenant_id = tid AND lower(email) = 'courier@gayrat.uz';

  INSERT INTO couriers (id, tenant_id, user_id, full_name, phone, status, vehicle_type, last_lat, last_lng, last_seen_at)
  VALUES (cid, tid, uid, 'Jasur Kuryer', '+998901000777', 'active', 'bike', 41.3111, 69.2797, NOW())
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    status = 'active',
    last_lat = EXCLUDED.last_lat,
    last_lng = EXCLUDED.last_lng,
    last_seen_at = NOW(),
    updated_at = NOW();

  SELECT id INTO cid FROM couriers WHERE tenant_id = tid AND user_id = uid;

  INSERT INTO courier_shifts (id, tenant_id, courier_id, status)
  SELECT gen_random_uuid(), tid, cid, 'open'
  WHERE NOT EXISTS (SELECT 1 FROM courier_shifts WHERE courier_id = cid AND status = 'open');
END $$;
