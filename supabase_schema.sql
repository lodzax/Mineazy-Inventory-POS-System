-- Supabase Schema for Mineazy

-- 1. Branches Table
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO branches (id, name, location) VALUES
('belmont', 'Belmont', 'Bulawayo'),
('junkshop', 'Junkshop', 'Bulawayo'),
('tongogara', 'Tongogara', 'Bulawayo'),
('esigodini-1', 'Esigodini 1', 'Esigodini'),
('esigodini-2', 'Esigodini 2', 'Esigodini'),
('mthwakazi', 'Mthwakazi', 'Mthwakazi'),
('mswela', 'Mswela', 'Mswela'),
('vid', 'VID', 'VID'),
('thobelani', 'Thobelani', 'Thobelani'),
('maphisa', 'Maphisa', 'Maphisa'),
('gweru-luton', 'Gweru-Luton Rd', 'Gweru'),
('gweru-bradford', 'Gweru-Bradford rd', 'Gweru'),
('donnington', 'Donnington Warehouse', 'Bulawayo')
ON CONFLICT (id) DO NOTHING;

-- Create profiles first as other tables reference it
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT CHECK (role IN ('Administrator', 'Manager', 'Supervisor', 'Cashier', 'Warehouse')) DEFAULT 'Cashier',
  branch_id TEXT REFERENCES branches(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Products Table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  price DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Inventory Table (Branch-Product Link)
CREATE TABLE IF NOT EXISTS inventory (
  id BIGSERIAL PRIMARY KEY,
  branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  stock DECIMAL(10,2) DEFAULT 0,
  low_stock_threshold DECIMAL(10,2) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, product_id)
);

-- 4. Transactions Table (For History)
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  branch_id TEXT REFERENCES branches(id),
  product_id TEXT REFERENCES products(id),
  amount DECIMAL(10,2) NOT NULL,
  type TEXT CHECK (type IN ('add', 'remove', 'transfer')),
  notes TEXT,
  user_id UUID REFERENCES profiles(id),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Sales Table
CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY,
  branch_id TEXT REFERENCES branches(id),
  total DECIMAL(10,2) NOT NULL,
  customer_name TEXT,
  cashier_name TEXT,
  items JSONB NOT NULL, -- Array of { productId, quantity, price }
  user_id UUID REFERENCES profiles(id),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  branch_id TEXT REFERENCES branches(id) NOT NULL,
  items JSONB NOT NULL, -- Array of { productId, quantity, suppliedQuantity }
  status TEXT CHECK (status IN ('Pending', 'Processed', 'Dispatched', 'Received', 'Cancelled')) DEFAULT 'Pending',
  notes TEXT,
  user_id UUID REFERENCES profiles(id) NOT NULL, -- The person who initiated the request
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES profiles(id),
  dispatched_at TIMESTAMPTZ,
  dispatched_by UUID REFERENCES profiles(id),
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Transfers Table
CREATE TABLE IF NOT EXISTS transfers (
  id BIGSERIAL PRIMARY KEY,
  from_branch_id TEXT REFERENCES branches(id),
  to_branch_id TEXT REFERENCES branches(id),
  items JSONB NOT NULL, -- Array of { productId, quantity }
  notes TEXT,
  user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime for tables safely
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'products') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'inventory') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sales') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sales;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transfers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transfers;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- RLS for tables (ALTER TABLE ... ENABLE RLS is idempotent)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper function to fix recursion in RLS
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins/Managers can view all profiles" ON profiles;
CREATE POLICY "Admins/Managers can view all profiles" ON profiles FOR SELECT TO authenticated USING (
  get_my_role() IN ('Administrator', 'Manager')
);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Notifications Policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);

-- Other Policies
DROP POLICY IF EXISTS "Allow public read for branches" ON branches;
CREATE POLICY "Allow public read for branches" ON branches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON branches;
CREATE POLICY "Allow all for authenticated users" ON branches FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON products;
CREATE POLICY "Allow all for authenticated users" ON products FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON inventory;
CREATE POLICY "Allow all for authenticated users" ON inventory FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON transactions;
CREATE POLICY "Allow all for authenticated users" ON transactions FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON sales;
CREATE POLICY "Allow all for authenticated users" ON sales FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON orders;
CREATE POLICY "Allow all for authenticated users" ON orders FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON transfers;
CREATE POLICY "Allow all for authenticated users" ON transfers FOR ALL TO authenticated USING (true);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, branch_id)
  VALUES (new.id, new.email, 'Cashier', NULL)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
