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
  pass_no text not null,
  registration_id uuid references registrations(id),
  state text not null default 'idle',
  linked_at timestamptz
);
-- 패스는 일회용이다. 출발 후에는 expired, 분실 재발급으로 버린 것은 revoked 로 남고 다시 쓰지 않는다.
-- 제약을 이름으로 지웠다가 다시 거는 것은, 먼저 만들어진 DB 에도 같은 규칙을 적용하기 위해서다.
alter table passes drop constraint if exists passes_pass_no_key;
alter table passes drop constraint if exists passes_state_check;
alter table passes add constraint passes_state_check
  check (state in ('idle','active','revoked','expired'));
-- 패스 번호 네 자리는 살아 있는 패스(미사용·사용 중) 안에서만 겹치지 않으면 된다.
-- 끝난 패스의 번호는 새 패스가 다시 쓴다.
create unique index if not exists passes_live_pass_no
  on passes (pass_no) where state in ('idle','active');

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
  action text not null,
  registration_id uuid
);
-- 먼저 만들어진 DB 에도 같은 규칙이 걸리도록 이름으로 지웠다가 다시 건다.
alter table access_logs drop constraint if exists access_logs_action_check;
alter table access_logs add constraint access_logs_action_check check (action in
  ('scan_view','number_view','receipt_view','list_view','link','reissue','cancel','login_fail','number_fail','register'));
create index if not exists access_logs_device on access_logs (device_key, action, at);
