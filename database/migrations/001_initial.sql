-- Cùng migration chạy trên PGlite và PostgreSQL; schema riêng không dùng Data API Supabase.
CREATE SCHEMA IF NOT EXISTS dasani;
CREATE TABLE IF NOT EXISTS dasani.users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('customer','admin')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dasani.sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES dasani.users(id),
 token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dasani.categories (id uuid PRIMARY KEY, name text NOT NULL, slug text UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS dasani.products (
 id uuid PRIMARY KEY, category_id uuid NOT NULL REFERENCES dasani.categories(id),
 name text NOT NULL, slug text UNIQUE NOT NULL, description text NOT NULL,
 price integer NOT NULL CHECK(price>0), image text NOT NULL, featured boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dasani.variants (
 id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES dasani.products(id),
 size text NOT NULL, color text NOT NULL, stock integer NOT NULL CHECK(stock>=0),
 active boolean NOT NULL DEFAULT true, UNIQUE(product_id,size,color)
);
CREATE TABLE IF NOT EXISTS dasani.orders (
 id uuid PRIMARY KEY, number text UNIQUE NOT NULL, user_id uuid NOT NULL REFERENCES dasani.users(id),
 recipient_name text NOT NULL, phone text NOT NULL, address text NOT NULL,
 payment_method text NOT NULL CHECK(payment_method IN ('COD','QR_DEMO')),
 payment_status text NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','paid')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','shipping','completed','cancelled')),
 total integer NOT NULL CHECK(total>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dasani.order_items (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES dasani.orders(id),
 variant_id uuid NOT NULL REFERENCES dasani.variants(id), name text NOT NULL,
 size text NOT NULL, color text NOT NULL, price integer NOT NULL CHECK(price>0),
 quantity integer NOT NULL CHECK(quantity>0)
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON dasani.orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS products_category_idx ON dasani.products(category_id,active);
CREATE INDEX IF NOT EXISTS variants_product_idx ON dasani.variants(product_id);
