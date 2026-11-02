-- Agenda Saya: skema awal.
-- Jalankan sekali di Supabase (SQL Editor -> paste -> Run, atau `supabase db push`).

create table if not exists public.events (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

create index if not exists events_date_idx on public.events ((data->>'date'));

-- Aplikasi hanya diakses lewat server (koneksi Postgres langsung), tidak lewat API publik Supabase.
-- RLS dinyalakan TANPA policy, jadi anon key / authenticated key tidak bisa membaca atau menulis tabel ini.
alter table public.events   enable row level security;
alter table public.settings enable row level security;
