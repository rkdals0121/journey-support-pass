create table if not exists zones (
  id text primary key,
  terminal text not null,
  label text not null,
  band text,                              -- 중앙부 / 중간 / 끝단 (탑승동만)
  gates int[] not null default '{}',
  facilities jsonb not null default '{}', -- { elevators:[], restrooms:[], waitingPoints:[] }
  code_hash text not null,
  is_desk boolean not null default false,
  active boolean not null default true
);

create table if not exists flights (
  flight_date date not null,
  flight_no text not null,
  master_no text not null default '',     -- 공동운항이면 실제 운항 편명
  airline text not null default '',
  dest_code text not null default '',
  dest_name text not null default '',
  terminal text not null default '',
  gate int,
  prev_gate int,
  gate_changed_at timestamptz,
  sched_at timestamptz not null,
  est_at timestamptz,
  status text not null default '',
  updated_at timestamptz not null,
  primary key (flight_date, flight_no)
);

create table if not exists flight_polls (
  id bigserial primary key,
  polled_at timestamptz not null,
  ok boolean not null,
  row_count int not null default 0,
  duration_ms int not null default 0,
  gate_changes int not null default 0,
  error text
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  receipt_no text,
  name text,
  flight_date date,
  flight_no text,
  categories text[] not null default '{}',
  needs text[] not null default '{}',
  route text not null check (route in ('web','paper','assisted')),
  consent_at timestamptz not null,
  started_at timestamptz not null,
  submitted_at timestamptz not null,
  edit_count int not null default 0,
  linked_at timestamptz,
  purged_at timestamptz,
  status text not null default 'pending' check (status in ('pending','active','expired','revoked')),
  is_mock boolean not null default true
);
create unique index if not exists registrations_pending_receipt
  on registrations (receipt_no) where status = 'pending';

create table if not exists passes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  pass_no text not null unique,
  registration_id uuid references registrations(id),
  state text not null default 'idle' check (state in ('idle','active','revoked')),
  linked_at timestamptz
);

create table if not exists encounters (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid references registrations(id),
  zone_id text not null references zones(id),
  scanned_at timestamptz not null,
  started_at timestamptz,
  ended_at timestamptz,
  categories text[] not null default '{}',
  support_groups text[] not null default '{}',
  gate_band text
);

create table if not exists access_logs (
  id bigserial primary key,
  at timestamptz not null,
  zone_id text,
  device_key text,
  action text not null check (action in
    ('scan_view','number_view','receipt_view','link','reissue','login_fail','number_fail')),
  registration_id uuid
);
create index if not exists access_logs_device on access_logs (device_key, action, at);
