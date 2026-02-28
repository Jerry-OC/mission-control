-- Feature Documentation System tables
-- features: top-level feature registry
CREATE TABLE IF NOT EXISTS features (
  id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text         NOT NULL,
  slug        text         NOT NULL UNIQUE,
  description text         DEFAULT '',
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now()
);

-- feature_docs: living documentation — one doc per feature
CREATE TABLE IF NOT EXISTS feature_docs (
  id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_id  uuid         NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  content     text         NOT NULL DEFAULT '',
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now(),
  UNIQUE(feature_id)
);

-- Enable Row Level Security (service key bypasses RLS for API access)
ALTER TABLE features     ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_docs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_all_features"
  ON features FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_feature_docs"
  ON feature_docs FOR ALL
  USING (true)
  WITH CHECK (true);
