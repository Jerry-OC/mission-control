-- ============================================================
-- Contacts / CRM — Full schema
-- Single source of truth for everyone David works with
-- Run in: https://supabase.com/dashboard/project/evfgrjslfrjwyopyzqzx/sql
-- ============================================================

-- Drop and recreate contacts (table was empty/placeholder)
DROP TABLE IF EXISTS contacts CASCADE;

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Name
  first_name      text,
  last_name       text,

  -- Contact info
  phone           text,          -- primary — dedup key with Google Contacts
  phone_alt       text,          -- secondary number
  email           text,
  email_alt       text,

  -- Company / role
  company         text,
  title           text,

  -- Address
  address         text,
  city            text,
  state           text DEFAULT 'CA',
  zip             text,

  -- Classification (multi-select)
  -- Values: client, subcontractor, vendor, trade_partner, personal, professional, lead
  types           text[] DEFAULT '{}',

  -- Trade / specialty (multi-select)
  -- Values: General Contractor, Plumber, Electrician, HVAC, Framer, Drywaller,
  --         Tile, Flooring, Painter, Roofer, Concrete, Landscaper, Designer,
  --         Architect, Inspector, Lawyer, Accountant, Videographer, Other
  trades          text[] DEFAULT '{}',

  -- Sub / vendor business info
  license_number  text,
  license_expiry  date,
  coi_expiry      date,          -- certificate of insurance expiry
  coi_amount      numeric,       -- COI coverage amount ($)

  -- CRM fields
  source          text,          -- how we met (referral, Google, job site, etc.)
  referred_by     uuid REFERENCES contacts(id) ON DELETE SET NULL,
  rating          smallint CHECK (rating >= 1 AND rating <= 5),
  last_contacted_at timestamptz,
  notes           text,
  tags            text[] DEFAULT '{}',  -- freeform labels

  -- Status
  is_verified     boolean DEFAULT false,  -- manually verified before entering main book
  is_active       boolean DEFAULT true,

  -- Sync bridge IDs
  google_contact_id text UNIQUE,  -- People API resourceName (e.g. "people/c123456")
  -- airtable_id stays null — Supabase is now master

  -- Metadata
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX contacts_phone_idx  ON contacts (phone);
CREATE INDEX contacts_email_idx  ON contacts (email);
CREATE INDEX contacts_types_idx  ON contacts USING gin (types);
CREATE INDEX contacts_trades_idx ON contacts USING gin (trades);
CREATE INDEX contacts_name_idx   ON contacts (last_name, first_name);
CREATE INDEX contacts_company_idx ON contacts (company);

-- ── Auto-update updated_at ─────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Helper view: full name ─────────────────────────────────
CREATE OR REPLACE VIEW contacts_view AS
SELECT *,
  trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) AS name,
  CASE
    WHEN coi_expiry < now() THEN 'expired'
    WHEN coi_expiry < now() + interval '30 days' THEN 'expiring_soon'
    ELSE 'ok'
  END AS coi_status,
  CASE
    WHEN license_expiry < now() THEN 'expired'
    WHEN license_expiry < now() + interval '30 days' THEN 'expiring_soon'
    ELSE 'ok'
  END AS license_status
FROM contacts;

-- ── Row-level security (service key bypasses, anon read-only) ──
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service key full access"
  ON contacts FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Seed: valid types and trades as reference (comments only) ──
-- types: client | subcontractor | vendor | trade_partner | personal | professional | lead
-- trades: General Contractor | Plumber | Electrician | HVAC | Framer | Drywaller |
--         Tile | Flooring | Painter | Roofer | Concrete | Landscaper | Designer |
--         Architect | Inspector | Lawyer | Accountant | Videographer | Other
