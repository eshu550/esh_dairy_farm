-- Run this once in your Supabase project's SQL Editor (Supabase Dashboard -> SQL Editor -> New query)
-- It creates all the tables the app needs, and locks each row to the user who created it.

create extension if not exists "pgcrypto";

create table if not exists cows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  tag_number text not null,
  breed text,
  dob date,
  status text default 'active',
  cycle_length int default 21,
  calving_date date,
  first_heat_date date,
  inseminated_on date,
  mastitis_antibiotic text,
  created_at timestamptz default now()
);

create table if not exists milk_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cow_id uuid references cows(id) on delete cascade,
  date date not null,
  session text not null,
  liters numeric not null,
  created_at timestamptz default now()
);

create table if not exists heat_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cow_id uuid references cows(id) on delete cascade,
  date date not null,
  bred boolean default false,
  notes text,
  created_at timestamptz default now()
);

create table if not exists medical_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cow_id uuid references cows(id) on delete cascade,
  date date not null,
  type text not null,
  description text,
  vet text,
  next_due_date date,
  created_at timestamptz default now()
);

create table if not exists calf_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cow_id uuid references cows(id) on delete cascade,
  date date not null,
  calf_name text,
  calf_tag_number text,
  gender text,
  birth_weight numeric,
  notes text,
  created_at timestamptz default now()
);

create table if not exists feed_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  cost_per_bag numeric not null,
  created_at timestamptz default now()
);

create table if not exists feed_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feed_type_id uuid references feed_types(id) on delete cascade,
  date date not null,
  kind text not null, -- 'purchase' or 'usage'
  bags numeric not null,
  cost numeric,
  notes text,
  created_at timestamptz default now()
);

-- Row Level Security: every user can only ever see/change their own rows
alter table cows enable row level security;
alter table milk_records enable row level security;
alter table heat_records enable row level security;
alter table medical_records enable row level security;
alter table calf_records enable row level security;
alter table feed_types enable row level security;
alter table feed_transactions enable row level security;

create policy "own rows only" on cows for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on milk_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on heat_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on medical_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on calf_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on feed_types for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on feed_transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
