-- Run this in Supabase SQL Editor to create the oracle_rounds table

create table if not exists oracle_rounds (
  round_id   integer primary key,
  rate       double precision not null,  -- wstETH/stETH exchange rate
  timestamp  bigint not null,            -- unix seconds
  block      bigint not null
);

-- Index for fast ordering
create index if not exists idx_oracle_rounds_timestamp on oracle_rounds(timestamp);

-- Allow public read, allow inserts from API (no auth needed for hackathon)
alter table oracle_rounds enable row level security;

create policy "Allow public read" on oracle_rounds
  for select using (true);

create policy "Allow public insert" on oracle_rounds
  for insert with check (true);
