-- ================================================================
-- Estimation System Migration
-- Author: Mickey (schema design) + Jerry (applied 2026-02-23)
-- ================================================================

-- ----------------------------------------------------------------
-- 1. ORDERS table (fresh; renamed from proposals concept)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid REFERENCES jobs(id) ON DELETE CASCADE,
  name         text NOT NULL,
  type         text CHECK (type IN ('Proposal','Change Order')) DEFAULT 'Proposal',
  status       text CHECK (status IN ('Draft','Sent','Signed')) DEFAULT 'Draft',
  date_sent    date,
  date_signed  date,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------
-- 2. LINE ITEMS — drop old schema, create new estimation schema
--    Old table: referenced proposals(id), had labor/materials/markup_pct
--    New table: references orders(id), has labor_cost/materials_cost/other_cost/margin_pct
--    + GENERATED computed columns for total_cost and price
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS line_items CASCADE;

CREATE TABLE line_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,
  labor_cost     numeric(12,2) NOT NULL DEFAULT 0,
  materials_cost numeric(12,2) NOT NULL DEFAULT 0,
  other_cost     numeric(12,2) NOT NULL DEFAULT 0,
  margin_pct     numeric(6,2) NOT NULL DEFAULT 20,
  notes          text,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  -- Computed server-side (immutable, always consistent)
  total_cost     numeric(12,2) GENERATED ALWAYS AS (labor_cost + materials_cost + other_cost) STORED,
  price          numeric(12,2) GENERATED ALWAYS AS (
                   ROUND((labor_cost + materials_cost + other_cost) * (1 + margin_pct / 100.0), 2)
                 ) STORED
);

-- ----------------------------------------------------------------
-- 3. order_summary VIEW — orders with aggregated line item totals
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW order_summary AS
SELECT
  o.id,
  o.job_id,
  o.name,
  o.type,
  o.status,
  o.date_sent,
  o.date_signed,
  o.notes,
  o.created_at,
  o.updated_at,
  COALESCE(SUM(li.total_cost), 0) AS total_cost,
  COALESCE(SUM(li.price), 0)      AS total_price,
  COUNT(li.id)                    AS line_item_count
FROM orders o
LEFT JOIN line_items li ON li.order_id = o.id
GROUP BY o.id, o.job_id, o.name, o.type, o.status,
         o.date_sent, o.date_signed, o.notes, o.created_at, o.updated_at;

-- ----------------------------------------------------------------
-- 4. job_estimating_summary VIEW — jobs with all estimating totals
--    Note: signed_cost / signed_price = sum of Signed orders only
--          (spec: "approved orders only for contract total")
-- ----------------------------------------------------------------
DROP VIEW IF EXISTS job_estimating_summary;

CREATE VIEW job_estimating_summary AS
SELECT
  j.id,
  j.name,
  j.status,
  j.projected_cost                                                    AS contract_cost,
  j.contract_amount                                                   AS contract_price,
  COALESCE(SUM(os.total_cost),  0)                                   AS total_estimated_cost,
  COALESCE(SUM(os.total_price), 0)                                   AS total_estimated_price,
  COALESCE(SUM(CASE WHEN o.status = 'Signed' THEN os.total_cost  ELSE 0 END), 0)
                                                                     AS signed_cost,
  COALESCE(SUM(CASE WHEN o.status = 'Signed' THEN os.total_price ELSE 0 END), 0)
                                                                     AS signed_price,
  COUNT(DISTINCT o.id)                                               AS order_count,
  COUNT(DISTINCT CASE WHEN o.status = 'Signed' THEN o.id END)       AS signed_order_count
FROM jobs j
LEFT JOIN orders o ON o.job_id = j.id
LEFT JOIN order_summary os ON os.id = o.id
GROUP BY j.id, j.name, j.status, j.projected_cost, j.contract_amount
ORDER BY j.name;

-- ----------------------------------------------------------------
-- 5. Triggers: auto-update updated_at
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_line_items_updated_at
BEFORE UPDATE ON line_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------
-- 6. Indexes
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_job_id    ON orders(job_id);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
CREATE INDEX IF NOT EXISTS idx_line_items_order ON line_items(order_id);
CREATE INDEX IF NOT EXISTS idx_line_items_sort  ON line_items(order_id, sort_order);

SELECT 'Estimation schema migration complete ✓' AS result;
