-- Design documents table for Mission Control Docs tab
CREATE TABLE IF NOT EXISTS design_docs (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  category text default 'general',
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
