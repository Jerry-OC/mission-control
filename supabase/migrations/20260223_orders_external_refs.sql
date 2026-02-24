-- ================================================================
-- Add external reference columns to orders
-- Date: 2026-02-23 (applied manually; documented retroactively)
-- Reason: reserve columns for future Airtable import and JobTread
--         order linking, so we can trace an order back to its
--         source in either legacy system.
--
-- NOTE: These columns are nullable/unused for new orders created in
--       Mission Control. They will be populated when/if we run an
--       Airtable → Supabase migration or sync with JobTread orders.
-- ================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS at_id        text,   -- Airtable record ID (rec...)
  ADD COLUMN IF NOT EXISTS jt_order_id  text;   -- JobTread order/proposal ID

COMMENT ON COLUMN orders.at_id       IS 'Airtable record ID — populated during Airtable migration; null for native MC orders';
COMMENT ON COLUMN orders.jt_order_id IS 'JobTread order/proposal ID — reserved for future JobTread sync; null for now';

SELECT 'orders external ref columns added ✓' AS result;
