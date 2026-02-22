-- ================================================================
-- Cody Design Build — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ================================================================
-- CONTACTS
-- Clients, vendors, subs, leads
-- ================================================================
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  company     text,
  type        text check (type in ('client','vendor','sub','lead')) default 'client',
  address     text,
  city        text,
  state       text default 'CA',
  zip         text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ================================================================
-- JOBS
-- Every project — active, completed, leads, estimates
-- ================================================================
create table if not exists jobs (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  status           text check (status in ('lead','estimating','proposed','active','on_hold','completed','cancelled')) default 'lead',
  client_id        uuid references contacts(id) on delete set null,
  address          text,
  city             text,
  state            text default 'CA',
  zip              text,
  description      text,
  contract_amount  numeric(12,2),
  projected_cost   numeric(12,2),
  start_date       date,
  end_date         date,
  jt_id            text,       -- JobTread reference (migration bridge)
  at_id            text,       -- Airtable record ID (migration bridge)
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ================================================================
-- COST CODES
-- 28 codes, color-coded by trade group
-- ================================================================
create table if not exists cost_codes (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique,
  name        text not null,
  category    text not null,
  color       text,           -- hex color for UI
  description text,
  created_at  timestamptz default now()
);

-- Seed cost codes (your 28 from Airtable)
insert into cost_codes (number, name, category, color) values
  ('01', 'Preconstruction',       'Preconstruction', '#a855f7'),
  ('02', 'Permits & Fees',        'Preconstruction', '#a855f7'),
  ('03', 'Design & Engineering',  'Preconstruction', '#a855f7'),
  ('10', 'Demo & Hauling',        'Site Work',       '#f97316'),
  ('11', 'Excavation & Grading',  'Site Work',       '#f97316'),
  ('12', 'Concrete',              'Site Work',       '#f97316'),
  ('20', 'Framing',               'Structure',       '#14b8a6'),
  ('21', 'Roofing',               'Structure',       '#14b8a6'),
  ('22', 'Waterproofing',         'Structure',       '#14b8a6'),
  ('23', 'Insulation',            'Structure',       '#14b8a6'),
  ('24', 'Drywall',               'Structure',       '#14b8a6'),
  ('30', 'Electrical',            'MEP',             '#ef4444'),
  ('31', 'Plumbing',              'MEP',             '#ef4444'),
  ('32', 'HVAC',                  'MEP',             '#ef4444'),
  ('40', 'Flooring',              'Finishes',        '#3b82f6'),
  ('41', 'Tile',                  'Finishes',        '#3b82f6'),
  ('42', 'Paint',                 'Finishes',        '#3b82f6'),
  ('43', 'Millwork & Trim',       'Finishes',        '#3b82f6'),
  ('50', 'Cabinets',              'Fixtures',        '#ec4899'),
  ('51', 'Countertops',           'Fixtures',        '#ec4899'),
  ('52', 'Appliances',            'Fixtures',        '#ec4899'),
  ('53', 'Plumbing Fixtures',     'Fixtures',        '#ec4899'),
  ('54', 'Lighting Fixtures',     'Fixtures',        '#ec4899'),
  ('60', 'Doors & Windows',       'Exterior',        '#22c55e'),
  ('61', 'Siding & Stucco',       'Exterior',        '#22c55e'),
  ('62', 'Landscaping',           'Exterior',        '#22c55e'),
  ('70', 'General Conditions',    'General',         '#6b7280'),
  ('71', 'Cleanup & Final',       'General',         '#6b7280')
on conflict (number) do nothing;

-- ================================================================
-- PROPOSALS
-- Covers original proposals, change orders, selection orders
-- ================================================================
create table if not exists proposals (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references jobs(id) on delete cascade,
  name         text not null,
  type         text check (type in ('Proposal','Change Order','Selection Order')) default 'Proposal',
  status       text check (status in ('Draft','Sent','Signed','Voided')) default 'Draft',
  date_sent    date,
  date_signed  date,
  notes        text,
  at_id        text,   -- Airtable record ID bridge
  jt_order_id  text,   -- JobTread order ID bridge
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ================================================================
-- LINE ITEMS
-- Individual scope items on a proposal
-- ================================================================
create table if not exists line_items (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid references proposals(id) on delete cascade,
  job_id        uuid references jobs(id) on delete cascade,
  name          text not null,
  description   text,
  cost_code_id  uuid references cost_codes(id) on delete set null,
  labor         numeric(12,2) default 0,
  materials     numeric(12,2) default 0,
  markup_pct    numeric(6,2) default 50,
  is_allowance  boolean default false,
  is_approved   boolean default false,
  notes         text,
  sort_order    integer default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  -- computed columns via generated columns
  total_cost    numeric(12,2) generated always as (labor + materials) stored,
  price         numeric(12,2) generated always as (round((labor + materials) * (1 + markup_pct / 100.0), 2)) stored
);

-- ================================================================
-- TRANSACTIONS
-- Plaid-imported bank transactions for job costing actuals
-- ================================================================
create table if not exists transactions (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid references jobs(id) on delete set null,
  cost_code_id         uuid references cost_codes(id) on delete set null,
  date                 date not null,
  amount               numeric(12,2) not null,
  description          text,
  merchant             text,
  account_name         text,
  account_id           text,
  category             text,
  status               text check (status in ('uncoded','coded','review','excluded')) default 'uncoded',
  plaid_transaction_id text unique,
  notes                text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- ================================================================
-- TASKS
-- Job-level and org-level task management
-- ================================================================
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  status      text check (status in ('To Do','In Progress','Blocked','Done')) default 'To Do',
  priority    text check (priority in ('Low','Medium','High','Urgent')) default 'Medium',
  level       text check (level in ('Org','Job')) default 'Org',
  job_id      uuid references jobs(id) on delete set null,
  job_name    text,       -- denormalized for display when no FK
  assignee    text check (assignee in ('David','Jerry','Phil','Bobby','Mickey')),
  due_date    date,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ================================================================
-- DOCUMENTS
-- Contracts, permits, lien waivers, invoices, photos
-- ================================================================
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references jobs(id) on delete cascade,
  type        text check (type in ('Contract','Proposal','Change Order','Lien Waiver','Permit','Invoice','Photo','Other')) default 'Other',
  name        text not null,
  url         text,
  signed      boolean default false,
  signed_at   timestamptz,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ================================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ================================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to all tables with updated_at
do $$ declare
  t text;
begin
  foreach t in array array['contacts','jobs','proposals','line_items','transactions','tasks','documents']
  loop
    execute format('
      create or replace trigger trg_%s_updated_at
      before update on %s
      for each row execute function update_updated_at();
    ', t, t);
  end loop;
end $$;

-- ================================================================
-- INDEXES (performance for common queries)
-- ================================================================
create index if not exists idx_jobs_status       on jobs(status);
create index if not exists idx_jobs_client_id    on jobs(client_id);
create index if not exists idx_proposals_job_id  on proposals(job_id);
create index if not exists idx_line_items_prop   on line_items(proposal_id);
create index if not exists idx_line_items_job    on line_items(job_id);
create index if not exists idx_transactions_job  on transactions(job_id);
create index if not exists idx_transactions_date on transactions(date);
create index if not exists idx_tasks_job_id      on tasks(job_id);
create index if not exists idx_tasks_status      on tasks(status);
create index if not exists idx_tasks_assignee    on tasks(assignee);

-- ================================================================
-- DONE
-- Tables created: contacts, jobs, cost_codes (28 seeded),
--   proposals, line_items, transactions, tasks, documents
-- ================================================================
select 'Schema created successfully ✓' as result;
