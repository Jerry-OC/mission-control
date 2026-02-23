-- ================================================================
-- Drop cost_code_id from line_items
-- Date: 2026-02-23
-- Reason: spec explicitly prohibits cost codes on estimate line items.
--         Cost codes are job costing only; the column was added in
--         order_groups migration (20260223_order_groups.sql) before the
--         spec was re-read and the code-side reference was removed in
--         commit 165ddb8.
-- ================================================================

ALTER TABLE line_items DROP COLUMN IF EXISTS cost_code_id;

SELECT 'cost_code_id dropped from line_items ✓' AS result;
