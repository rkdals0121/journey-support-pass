create table if not exists zones (
  id text primary key,
  terminal text not null,
  label text not null,
  band text,                              -- 중앙부 / 중간 / 끝단 (탑승동만)
  gates int[] not null default '{}',
  facilities jsonb not null default '{}', -- 쓰지 않는다. 시설 위치는 src/lib/airport.ts 에 있다.
  code_hash text not null,
  is_desk boolean not null default false,
  active boolean not null default true
);
-- 공통 직원 코드로 들어온 사람이 근무 구역을 고르기 전에 머무는 자리. 탑승구도 여객도 없다.
alter table zones add column if not exists is_common boolean not null default false;
-- 키오스크 설치 코드의 자리. 구역이 아니다. 이 코드로 들어온 기기는 키오스크로만 동작한다.
alter table zones add column if not exists is_kiosk boolean not null default false;

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

-- 여객 한 명의 등록. 이름·연락처·진단명은 받지 않는다 (name, categories, receipt_no 는 예전 구조의 칸이며 쓰지 않는다).
-- needs 에는 여객이 고른 항목 코드가 모두 들어간다 (안내받는 방식, 이동, 찾는 시설, 직원 도움).
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  receipt_no text,
  name text,
  flight_date date,
  flight_no text,
  categories text[] not null default '{}',
  needs text[] not null default '{}',
  route text not null,
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
-- 여객이 고른 화면 언어 (ko / en). 안내 화면이 이 언어로 열린다.
alter table registrations add column if not exists lang text not null default 'ko';
-- 등록 경로: 여객 휴대전화(web), 공항 키오스크(kiosk), 직원이 대신 입력(assisted). paper 는 예전 값이다.
alter table registrations drop constraint if exists registrations_route_check;
alter table registrations add constraint registrations_route_check
  check (route in ('web','kiosk','assisted','paper'));
-- 증빙 확인 결과. 증빙서류와 대상 유형(노약자·영유아 동반·장애·임산부)은 받지 않는다.
-- 제안 구조에서 증빙은 공항이 아닌 별도 서버가 암호화해 보관하고, 공항은 "확인됐다"는 값만 쓴다.
-- 시제품에는 별도 서버가 없으므로 여객이 증빙을 냈다고 하면 바로 확인된 것(verified)으로 둔다.
alter table registrations add column if not exists proof_status text not null default 'none';
alter table registrations drop constraint if exists registrations_proof_check;
alter table registrations add constraint registrations_proof_check check (proof_status in ('none','verified'));
-- 등록에 들어온 접점. booking: 항공권 예매 완료 창(또는 예약 확인 문자)의 링크. 빈 글자: 그 밖.
alter table registrations add column if not exists via text not null default '';
-- 체크리스트 3쪽과 마지막 쪽에서 받는 것. 함께 가는 분을 포함한 모두의 수, 유모차 수, 「더 하고 싶은 말씀」(200자까지).
-- 이름·연락처는 아니지만 말씀에는 건강과 관련된 내용이 들어갈 수 있어 출발 후 다른 항목과 함께 지운다(purge.ts).
alter table registrations add column if not exists party_size int;
alter table registrations add column if not exists stroller_count int;
alter table registrations add column if not exists note text;

create table if not exists passes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  pass_no text not null,
  registration_id uuid references registrations(id),
  state text not null default 'idle',
  linked_at timestamptz
);
-- 패스는 일회용이다. 출발 후에는 expired, 여객이 지운 것은 revoked 로 남고 다시 쓰지 않는다.
-- 제약을 이름으로 지웠다가 다시 거는 것은, 먼저 만들어진 DB 에도 같은 규칙을 적용하기 위해서다.
alter table passes drop constraint if exists passes_pass_no_key;
alter table passes drop constraint if exists passes_state_check;
alter table passes add constraint passes_state_check
  check (state in ('idle','active','revoked','expired'));
-- 패스 번호 여섯 자리는 살아 있는 패스 안에서만 겹치지 않으면 된다. 끝난 패스의 번호는 새 패스가 다시 쓴다.
create unique index if not exists passes_live_pass_no
  on passes (pass_no) where state in ('idle','active');
-- 한 등록이 쓰는 패스는 한 장뿐이다.
create unique index if not exists passes_one_active_per_registration
  on passes (registration_id) where state = 'active';
-- 체크인하면서 전자토큰을 탑승권에 저장한 시각(시제품은 모의 체크인). 아직이면 null.
alter table passes add column if not exists checked_in_at timestamptz;
-- 공항 입구 키오스크에서 그 자리에서 등록한 여객의 탑승권 번호(시연용 모의 탑승권 QR 의 번호).
-- 그 탑승권을 다시 찍으면 이 패스가 열린다. 미리 등록한 여객은 null(휴대전화 탑승권의 QR 이 곧 패스다).
alter table passes add column if not exists boarding_ref text;
create unique index if not exists passes_live_boarding_ref
  on passes (boarding_ref) where boarding_ref is not null and state in ('idle','active');

-- 여객이 키오스크에서 누른 「직원 부르기」. 어느 키오스크에서 불렀는지와 받은 구역만 남긴다. 직원 개인은 남기지 않는다.
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null,
  place_id text not null,
  zone_id text not null,
  registration_id uuid references registrations(id),
  screen text not null default '',        -- register / guide
  accepted_at timestamptz,
  accepted_zone text,
  ended_at timestamptz,
  end_kind text check (end_kind in ('done','cancelled'))
);
-- 한 키오스크에서 끝나지 않은 호출은 하나뿐이다. 버튼을 여러 번 눌러도 한 줄만 생긴다.
create unique index if not exists calls_open_per_place on calls (place_id) where ended_at is null;

-- 이동지원(전동차) 요청. 여객이 공항 입구 키오스크나 휴대전화에서 청하고, 직원이 받아 배정·이동·완료로 처리한다.
-- 누구의 것인지는 등록과의 연결로만 알며, 여객이 떠나면 연결을 끊는다.
create table if not exists assist_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null,
  registration_id uuid references registrations(id),
  place_id text,
  state text not null check (state in ('received','assigned','moving','done','cancelled')),
  assigned_zone text,
  assigned_at timestamptz,
  ended_at timestamptz
);
-- 한 여객의 끝나지 않은 요청은 하나뿐이다.
create unique index if not exists assist_open_per_registration
  on assist_requests (registration_id) where state in ('received','assigned','moving');

-- 기대효과를 확인하는 데 쓰는 건수 기록. 누구의 것인지 알 수 있는 값은 없다.
--   reg_start: 등록을 시작함 (첫 질문을 넘김)   reg_done: 등록을 마침
--   guide_open: 안내 화면을 엶                  survey: 만족도 응답 (value 1~3)
create table if not exists events (
  id bigserial primary key,
  at timestamptz not null,
  kind text not null check (kind in ('reg_start','reg_done','guide_open','survey')),
  route text not null default '',
  adapted boolean not null default false, -- 큰 글씨·소리·그림·쉬운 말 가운데 하나라도 켰는가
  place_id text,
  value int,
  device_key text                         -- 남용을 막는 데만 쓴다. 접속 주소와 기기 표시의 해시
);
create index if not exists events_at on events (at);
-- checkin: 모의 체크인으로 탑승권에 전자토큰을 저장함   exit_check: 우대출구에서 탑승권을 확인함 (value 1 대상 확인 / 0 확인 안 됨)
-- reg_done 의 value 는 증빙을 냈는가(1/0)다. 등록은 출발 뒤 지워지지만 이 건수는 남는다.
alter table events drop constraint if exists events_kind_check;
alter table events add constraint events_kind_check
  check (kind in ('reg_start','reg_done','guide_open','survey','checkin','exit_check'));

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
  ('scan_view','number_view','receipt_view','list_view','link','reissue','cancel','edit','login_fail','number_fail','register','exit_view'));
create index if not exists access_logs_device on access_logs (device_key, action, at);
