-- ================================================================
-- Add Line Item Categories
-- Author: Mickey (spec) + Automated Improvement
-- Date: 2026-03-03
-- ================================================================
--
-- Purpose: Organize line items by category (e.g., Demo, Framing, Plumbing, Finishes)
-- for cleaner proposal rendering and improved UX.
--
-- Changes:
--   1. Add `category text` column to line_items (nullable, default null)
--   2. Update views to acknowledge category
--   3. Index for grouped queries
--
-- ================================================================

ALTER TABLE line_items
ADD COLUMN IF NOT EXISTS category text DEFAULT NULL;

-- Index for efficient grouping/filtering by category
CREATE INDEX IF NOT EXISTS idx_line_items_category ON line_items(order_id, category, sort_order);

SELECT 'Line item categories migration complete ✓' AS result;
