-- 1. order_groups table
CREATE TABLE IF NOT EXISTS order_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_groups_order ON order_groups(order_id);

CREATE OR REPLACE TRIGGER trg_order_groups_updated_at
BEFORE UPDATE ON order_groups
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Add group_id and cost_code_id to line_items
ALTER TABLE line_items
  ADD COLUMN IF NOT EXISTS group_id      uuid REFERENCES order_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_code_id  uuid REFERENCES cost_codes(id)   ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_line_items_group     ON line_items(group_id);
CREATE INDEX IF NOT EXISTS idx_line_items_cost_code ON line_items(cost_code_id);
