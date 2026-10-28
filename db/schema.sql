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


-- DX pilot: a request is distinct from pre-registration or an equipment reservation.
-- Capacity is enforced by a partial unique seat index, including concurrent bookings.
create table if not exists support_hub_rules (
 hub_id text not null, service text not null check(service in ('robot','mobility')),
 open_hour int not null default 9 check(open_hour between 0 and 23),
 close_hour int not null default 18 check(close_hour between 1 and 24),
 capacity int not null default 1 check(capacity between 0 and 4),
 state text not null default 'ready' check(state in ('ready','paused','charging')),
 battery int not null default 100 check(battery between 0 and 100),
 available_after timestamptz, reason text not null default '', version int not null default 0,
 primary key(hub_id,service), check(close_hour>open_hour)
);
create table if not exists support_visits (
 id uuid primary key default gen_random_uuid(), receipt_hash text not null unique,
 hub_id text not null, service text not null check(service in ('robot','mobility')),
 start_at timestamptz not null, seat int not null check(seat between 1 and 4),
 state text not null default 'booked' check(state in ('booked','checked_in','responding','handed_over','done','cancelled','missed')),
 task text not null check(task in ('directions','wheelchair','escort')), choices text[] not null default '{}',
 party int not null check(party between 1 and 20), recognition text not null default '',
 destination_id text, request_id uuid, assigned_crew uuid,
 version int not null default 0, created_at timestamptz not null, updated_at timestamptz not null,
 ended_at timestamptz, device_key text not null
);
create unique index if not exists support_visits_seat on support_visits(hub_id,service,start_at,seat) where state in ('booked','checked_in','responding','handed_over');
create unique index if not exists support_visits_crew on support_visits(assigned_crew) where assigned_crew is not null and state in ('checked_in','responding','handed_over');
alter table support_visits add column if not exists notice text not null default '';
create index if not exists support_visits_due on support_visits(state,start_at);
create table if not exists support_visit_history (
 visit_id uuid not null references support_visits(id) on delete cascade, version int not null,
 action text not null, actor text not null, at timestamptz not null, reason text not null default '',
 primary key(visit_id,version)
);
create table if not exists support_crew (
 id uuid primary key default gen_random_uuid(), session_hash text not null unique,
 zone_id text not null, label text not null,
 state text not null check(state in ('available','busy','away')), expires_at timestamptz not null,
 version int not null default 0
);
create table if not exists support_experience_events (
 id uuid primary key default gen_random_uuid(), at timestamptz not null, device_key text not null,
 kind text not null check(kind in ('stamp_start','stamp_finish','stamp_share','robot_complete','handover','delay','paper_replaced')),
 value int not null default 1 check(value between 0 and 1000)
);
-- Existing registration/pass/assist tables and their behaviour stay intact.
create table if not exists service_requests (
 id uuid primary key default gen_random_uuid(),
 receipt_hash text not null unique,
 registration_id uuid references registrations(id) on delete set null,
 service text not null check (service in ('guidance','robot','mobility')),
 state text not null default 'received' check (state in ('received','assigned','en_route','arrived','serving','done','cancelled','unavailable','expired')),
 place_id text not null,
 choices text[] not null default '{}', party int not null check (party between 1 and 20),
 note text not null default '', lang text not null check (lang in ('ko','en')),
 source text not null check (source in ('web','preregistered','kiosk','assisted')),
 assigned_zone text references zones(id), reason text not null default '',
 created_at timestamptz not null, updated_at timestamptz not null,
 accepted_at timestamptz, arrived_at timestamptz, started_at timestamptz, ended_at timestamptz,
 expires_at timestamptz not null, version int not null default 0,
 device_key text not null
);
-- Sandbox outbox only. Vendor protocols and live commands require a separate adapter.
create table if not exists integration_jobs (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references service_requests(id) on delete cascade,
 channel text not null check(channel in ('agency','robot','mobility')),
 state text not null default 'pending' check(state in ('pending','sending','acknowledged','in_progress','completed','failed','stopped')),
 resource_id uuid, request_version int not null, created_by_zone text not null,
 external_id text, attempts int not null default 0, sequence bigint not null default 0,
 last_error text not null default '', version int not null default 0,
 created_at timestamptz not null, updated_at timestamptz not null,
 next_attempt_at timestamptz not null, lease_until timestamptz,
 unique(request_id,channel)
);
create index if not exists integration_jobs_due on integration_jobs(state,next_attempt_at);
alter table integration_jobs add column if not exists request_version int not null default -1;
create index if not exists service_requests_open on service_requests (state, created_at);
create index if not exists service_requests_device on service_requests (device_key, created_at);
-- One active request per pre-registration; a second browser cannot create a duplicate.
create unique index if not exists service_requests_one_active_registration
 on service_requests(registration_id) where registration_id is not null and state in ('received','assigned','en_route','arrived','serving');

-- Atomic quota counters; do not rely on a stale count in concurrent requests.
create table if not exists service_request_limits (
 bucket text not null, window_at timestamptz not null, used int not null,
 primary key(bucket,window_at)
);

-- Staff opt-in browser push subscriptions expire with their login session.
create table if not exists request_push_subscriptions (
 id text primary key, zone_id text not null references zones(id),
 subscription jsonb not null, expires_at timestamptz not null
);

-- Explicit termination reasons for future legacy writes; existing unknown outcomes are not reclassified.
alter table calls drop constraint if exists calls_end_kind_check;
alter table calls add constraint calls_end_kind_check check (end_kind in ('done','cancelled','expired'));
alter table assist_requests add column if not exists end_kind text check (end_kind in ('done','cancelled','expired'));

-- A booked visit and its fulfilment keep one public reference.
alter table service_requests add column if not exists visit_id uuid;
alter table service_requests add column if not exists planned_at timestamptz;
alter table service_requests add column if not exists assigned_crew uuid;
alter table service_requests add column if not exists target_zone text;
alter table support_visits add column if not exists registration_id uuid;
alter table support_visits add column if not exists lang text not null default 'ko';
alter table support_visits add column if not exists handed_over_at timestamptz;
alter table support_visits add column if not exists resource_id uuid;
alter table support_visits add column if not exists flight_no text;
alter table support_visits add column if not exists flight_date text;
create unique index if not exists service_request_visit on service_requests(visit_id) where visit_id is not null;

-- Work history is recorded atomically with each version change, including expiry/erasure.
alter table service_requests add column if not exists last_action text not null default 'baseline';
alter table service_requests add column if not exists last_actor_zone text;
alter table service_requests add column if not exists last_action_reason text not null default '';
create table if not exists service_request_history (
 request_id uuid not null references service_requests(id) on delete cascade,
 version int not null, at timestamptz not null, action text not null, state text not null,
 actor_zone text, assigned_zone text, reason text not null default '',
 primary key(request_id,version)
);
create or replace function record_service_request_history() returns trigger language plpgsql as $$
begin
 if TG_OP='INSERT' or NEW.version<>OLD.version then
  insert into service_request_history(request_id,version,at,action,state,actor_zone,assigned_zone,reason)
   values(NEW.id,NEW.version,NEW.updated_at,NEW.last_action,NEW.state,NEW.last_actor_zone,NEW.assigned_zone,NEW.last_action_reason)
   on conflict do nothing;
 end if;
 return NEW;
end $$;
drop trigger if exists service_request_history_trigger on service_requests;
create trigger service_request_history_trigger after insert or update on service_requests
 for each row execute function record_service_request_history();
-- Existing rows are a known baseline, not invented historical events.
insert into service_request_history(request_id,version,at,action,state,assigned_zone)
 select id,version,updated_at,'baseline',state,assigned_zone from service_requests on conflict do nothing;

-- Anonymous linkage counters survive erasure of the actual registration identifier.
alter table service_requests add column if not exists registration_linked boolean not null default false;
alter table calls add column if not exists registration_linked boolean not null default false;
alter table assist_requests add column if not exists registration_linked boolean not null default false;
update service_requests set registration_linked=true where not registration_linked and (registration_id is not null or source='preregistered');
update calls set registration_linked=true where not registration_linked and registration_id is not null;
update assist_requests set registration_linked=true where not registration_linked and registration_id is not null;
create or replace function remember_request_registration_link() returns trigger language plpgsql as $$
begin
 if NEW.registration_id is not null then NEW.registration_linked=true;
 elsif TG_OP='UPDATE' and OLD.registration_linked then NEW.registration_linked=true;
 end if;
 return NEW;
end $$;
drop trigger if exists remember_request_registration on service_requests;
create trigger remember_request_registration before insert or update on service_requests for each row execute function remember_request_registration_link();
drop trigger if exists remember_request_registration on calls;
create trigger remember_request_registration before insert or update on calls for each row execute function remember_request_registration_link();
drop trigger if exists remember_request_registration on assist_requests;
create trigger remember_request_registration before insert or update on assist_requests for each row execute function remember_request_registration_link();

-- One operational read model; source records remain authoritative and are never copied twice.
alter table calls add column if not exists work_version bigint not null default 0;
alter table assist_requests add column if not exists work_version bigint not null default 0;
alter table assist_requests add column if not exists moving_at timestamptz;
alter table calls add column if not exists operator_reason text not null default '';
alter table assist_requests add column if not exists operator_reason text not null default '';
alter table calls add column if not exists operator_actor_zone text;
alter table assist_requests add column if not exists operator_actor_zone text;
alter table calls add column if not exists operator_closed_version bigint;
alter table assist_requests add column if not exists operator_closed_version bigint;
create or replace function increment_legacy_work_version() returns trigger language plpgsql as $$
begin
 if NEW is distinct from OLD then NEW.work_version:=OLD.work_version+1; end if;
 return NEW;
end $$;
drop trigger if exists update_legacy_work_version on calls;
create trigger update_legacy_work_version before update on calls for each row execute function increment_legacy_work_version();
drop trigger if exists update_legacy_work_version on assist_requests;
create trigger update_legacy_work_version before update on assist_requests for each row execute function increment_legacy_work_version();
alter table service_requests add column if not exists pending_place_id text;
alter table service_requests add column if not exists pending_place_at timestamptz;
alter table service_requests drop constraint if exists service_requests_pending_place_check;
alter table service_requests add constraint service_requests_pending_place_check check(
 (pending_place_id is null)=(pending_place_at is null) and
 (pending_place_id is null or state in ('assigned','en_route','arrived'))
);
alter table service_requests add column if not exists topic_id text;
alter table service_requests add column if not exists business_id text;
alter table service_requests add column if not exists destination_id text;
alter table service_requests add column if not exists resolution_kind text;
alter table service_requests add column if not exists resolution_business_id text;
alter table service_requests add column if not exists resolution_message text not null default '';
alter table service_requests drop constraint if exists service_requests_resolution_check;
alter table service_requests add constraint service_requests_resolution_check check (
 (resolution_kind is null and resolution_business_id is null and resolution_message='') or
 (resolution_kind is not null and resolution_kind in ('advice','referral','handoff','resolved') and state='done' and length(trim(resolution_message)) between 1 and 240)
);
create or replace function reset_request_destination() returns trigger as $$
begin
 if new.place_id is distinct from old.place_id then new.destination_id=null; end if;
 if new.place_id='' then
  new.topic_id=null; new.business_id=null; new.destination_id=null;
  new.resolution_kind=null; new.resolution_business_id=null; new.resolution_message='';
 end if;
 return new;
end; $$ language plpgsql;
drop trigger if exists reset_request_destination_trigger on service_requests;
create trigger reset_request_destination_trigger before update on service_requests
for each row execute function reset_request_destination();
alter table service_requests add column if not exists service_details jsonb not null default '{}'::jsonb;

create or replace view request_work_ledger as
select id::text,id as source_id,'integrated'::text as queue,registration_id,service,state,place_id,choices,party,note,lang,source,
 assigned_zone,reason,created_at,updated_at,expires_at,version::double precision as version,
 accepted_at,arrived_at,started_at,ended_at,registration_linked,pending_place_id,pending_place_at,topic_id,business_id,destination_id,resolution_kind,resolution_business_id,resolution_message,service_details,assigned_crew,visit_id,planned_at
from service_requests where planned_at is null
union all
select 'call:'||c.id::text,c.id,'call',c.registration_id,'guidance',
 case when c.ended_at is null then case when c.accepted_at is null then 'received' else 'serving' end
 when c.end_kind='done' then 'done'
 when c.end_kind='expired' then 'expired' else 'cancelled' end,
 c.place_id,coalesce(r.needs,'{}'::text[]),coalesce(r.party_size,1),coalesce(r.note,''),coalesce(r.lang,'ko'),'kiosk',
 c.accepted_zone,c.operator_reason,c.created_at,coalesce(c.ended_at,c.accepted_at,c.created_at),c.created_at+interval '24 hours',
 c.work_version::double precision,
 c.accepted_at,null::timestamptz,c.accepted_at,c.ended_at,c.registration_linked,null::text,null::timestamptz,null::text,null::text,null::text,null::text,null::text,''::text,'{}'::jsonb,null::uuid,null::uuid,null::timestamptz
from calls c left join registrations r on r.id=c.registration_id and r.status in ('active','pending')
union all
select 'assist:'||a.id::text,a.id,'assist',a.registration_id,'mobility',
 case when a.state='moving' then 'serving' when a.end_kind='expired' then 'expired' else a.state end,
 coalesce(a.place_id,''),coalesce(r.needs,'{}'::text[]),coalesce(r.party_size,1),coalesce(r.note,''),coalesce(r.lang,'ko'),
 case when a.place_id is null then 'web' else 'kiosk' end,a.assigned_zone,a.operator_reason,a.created_at,
 coalesce(a.ended_at,a.moving_at,a.assigned_at,a.created_at),a.created_at+interval '24 hours',
 a.work_version::double precision,
 a.assigned_at,null::timestamptz,a.moving_at,a.ended_at,a.registration_linked,null::text,null::timestamptz,null::text,null::text,null::text,null::text,null::text,''::text,'{}'::jsonb,null::uuid,null::uuid,null::timestamptz
from assist_requests a left join registrations r on r.id=a.registration_id and r.status in ('active','pending');

-- Internal pilot inventory. No physical device is provisioned or commanded here.
create table if not exists dispatch_resources (
 id uuid primary key default gen_random_uuid(),
 label text not null unique check (length(label) between 1 and 40),
 kind text not null check (kind in ('robot','mobility')),
 zone_id text not null references zones(id),
 status text not null default 'ready' check (status in ('ready','maintenance','offline')),
 version int not null default 0,
 created_at timestamptz not null, updated_at timestamptz not null
);
alter table dispatch_resources add column if not exists hub_id text;
alter table dispatch_resources add column if not exists unit_no int;
create unique index if not exists dispatch_hub_unit on dispatch_resources(hub_id,kind,unit_no) where hub_id is not null and unit_no is not null;
create table if not exists support_resource_holds (
 resource_id uuid primary key, visit_id uuid not null references support_visits(id) on delete cascade,
 active boolean not null default true, release_at timestamptz, updated_at timestamptz not null
);
alter table service_requests add column if not exists resource_id uuid references dispatch_resources(id);
create unique index if not exists one_active_request_per_resource on service_requests(resource_id)
 where resource_id is not null and state in ('received','assigned','en_route','arrived','serving');

-- Serialize allocation and inventory status changes on the resource row. All statements
-- inside these functions share one transaction; history-trigger failures roll back allocation.
create or replace function allocate_dispatch_resource(
 p_request uuid,p_version int,p_resource uuid,p_actor text,p_desk boolean,p_now timestamptz
) returns text language plpgsql as $$
declare gear dispatch_resources%rowtype; job service_requests%rowtype; visit_ref uuid; scope_hub text; scope_kind text; operating support_hub_rules%rowtype; in_use int;
begin
 select visit_id into visit_ref from service_requests where id=p_request;
 if visit_ref is not null then perform id from support_visits where id=visit_ref for update; end if;
 if p_resource is not null then
  select hub_id,kind into scope_hub,scope_kind from dispatch_resources where id=p_resource;
  if scope_hub is not null then
   insert into support_hub_rules(hub_id,service) values(scope_hub,scope_kind) on conflict do nothing;
   select * into operating from support_hub_rules where hub_id=scope_hub and service=scope_kind for update;
   if operating.state<>'ready' or operating.battery<20 or operating.capacity=0 or operating.available_after>p_now then return 'not_ready'; end if;
   if extract(hour from p_now at time zone 'Asia/Seoul')<operating.open_hour or extract(hour from p_now at time zone 'Asia/Seoul')>=operating.close_hour then return 'not_ready'; end if;
   select count(*) into in_use from (
    select d.id from dispatch_resources d join service_requests r on r.resource_id=d.id where d.hub_id=scope_hub and d.kind=scope_kind and r.id<>p_request and r.state in ('received','assigned','en_route','arrived','serving')
    union select h.resource_id from support_resource_holds h join dispatch_resources d on d.id=h.resource_id where d.hub_id=scope_hub and d.kind=scope_kind and h.visit_id<>coalesce(visit_ref,p_request) and (h.active or h.release_at>p_now)
   ) occupied;
   if in_use>=operating.capacity then return 'busy'; end if;
  end if;
 end if;
 if p_resource is not null then
  select * into gear from dispatch_resources where id=p_resource for update;
  if not found then return 'resource_missing'; end if;
  if gear.status<>'ready' then return 'not_ready'; end if;
  if exists(select 1 from support_resource_holds where resource_id=p_resource and visit_id<>coalesce(visit_ref,p_request) and (active or release_at>p_now)) then return 'busy'; end if;
  if not exists(select 1 from zones where id=gear.zone_id and active) then return 'not_ready'; end if;
 end if;
 select * into job from service_requests where id=p_request for update;
 if not found or job.expires_at<=p_now then return 'request_missing'; end if;
 if job.version<>p_version then return 'stale'; end if;
 if not p_desk and job.assigned_zone is distinct from p_actor then return 'forbidden'; end if;
 if job.state<>'assigned' then return 'stage'; end if;
 if job.pending_place_id is not null then return 'location_pending'; end if;
 if job.service not in ('robot','mobility') then return 'kind'; end if;
 if p_resource is not null then
  if gear.kind<>job.service then return 'kind'; end if;
  if exists(select 1 from service_requests where resource_id=p_resource and id<>p_request
   and state in ('received','assigned','en_route','arrived','serving')) then return 'busy'; end if;
 end if;
 if job.resource_id is not distinct from p_resource then return 'unchanged'; end if;
 update service_requests set resource_id=p_resource,version=version+1,updated_at=p_now,
  last_action=case when p_resource is null then 'resource_release' else 'resource_assign' end,
  last_actor_zone=p_actor,last_action_reason=case when p_resource is null then '장비 배차 해제' else '장비 배차: '||gear.label end
 where id=p_request;
 if visit_ref is not null then
  update support_resource_holds set active=false,release_at=p_now+interval '5 minutes',updated_at=p_now where visit_id=visit_ref and resource_id is distinct from p_resource and active;
  if p_resource is not null then
   insert into support_resource_holds(resource_id,visit_id,active,updated_at) values(p_resource,visit_ref,true,p_now)
   on conflict(resource_id) do update set visit_id=visit_ref,active=true,release_at=null,updated_at=p_now;
  end if;
  update support_visits set resource_id=p_resource,updated_at=p_now,version=version+1 where id=visit_ref and resource_id is distinct from p_resource;
 end if;
 return 'ok';
end $$;

create or replace function change_dispatch_resource_status(
 p_id uuid,p_version int,p_status text,p_now timestamptz
) returns text language plpgsql as $$
declare gear dispatch_resources%rowtype;
begin
 select * into gear from dispatch_resources where id=p_id for update;
 if not found then return 'resource_missing'; end if;
 if gear.version<>p_version then return 'stale'; end if;
 if p_status not in ('ready','maintenance','offline') then return 'status'; end if;
 if exists(select 1 from support_resource_holds where resource_id=p_id and (active or release_at>p_now)) then return 'busy'; end if;
 if exists(select 1 from service_requests where resource_id=p_id
  and state in ('received','assigned','en_route','arrived','serving')) then return 'busy'; end if;
 update dispatch_resources set status=p_status,version=version+1,updated_at=p_now where id=p_id;
 return 'ok';
end $$;

-- Durable generic notification metadata; never store passenger contents or push endpoints here.
create table if not exists request_alerts (
 request_id uuid primary key references service_requests(id) on delete cascade,
 created_at timestamptz not null, expires_at timestamptz not null,
 acknowledged_at timestamptz, acknowledged_zone text references zones(id)
);
create table if not exists request_alert_deliveries (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references request_alerts(request_id) on delete cascade,
 subscription_id text not null, zone_id text not null,
 state text not null default 'queued' check(state in ('queued','sending','retry','sent','failed','expired','cancelled')),
 attempts int not null default 0, next_attempt_at timestamptz not null,
 lease_token uuid, lease_until timestamptz, accepted_at timestamptz, received_at timestamptz,
 error_code text not null default '', unique(request_id,subscription_id)
);
create index if not exists request_alert_due on request_alert_deliveries(state,next_attempt_at);
alter table request_alerts add column if not exists kind text not null default 'request';
create or replace function enqueue_request_alert() returns trigger language plpgsql as $$
declare event_kind text; event_at timestamptz;
begin
 if TG_OP='INSERT' then
  event_kind:=case when NEW.planned_at is not null then 'reservation' else 'request' end;
  event_at:=NEW.created_at;
 elsif OLD.planned_at is not null and NEW.planned_at is null and NEW.state='received' then event_kind:='arrival'; event_at:=NEW.updated_at;
 elsif NEW.last_action='handover' and NEW.version<>OLD.version and OLD.last_action<>'handover' then event_kind:='handover'; event_at:=NEW.updated_at;
 else return NEW; end if;
 delete from request_alert_deliveries where request_id=NEW.id;
 insert into request_alerts(request_id,created_at,expires_at,kind)
 values(NEW.id,event_at,event_at+interval '10 minutes',event_kind)
 on conflict(request_id) do update set created_at=excluded.created_at,expires_at=excluded.expires_at,kind=excluded.kind,acknowledged_at=null,acknowledged_zone=null;
 insert into request_alert_deliveries(request_id,subscription_id,zone_id,next_attempt_at)
 select NEW.id,s.id,s.zone_id,event_at from request_push_subscriptions s where s.expires_at>event_at and (NEW.visit_id is null or s.zone_id=NEW.target_zone or s.zone_id=NEW.assigned_zone or exists(select 1 from zones z where z.id=s.zone_id and z.is_desk and z.active));
 return NEW;
end $$;
drop trigger if exists enqueue_request_alert_trigger on service_requests;
create trigger enqueue_request_alert_trigger after insert or update on service_requests for each row execute function enqueue_request_alert();

-- One live request for a registration/service across new and retained writers.
-- A null owner quarantines pre-existing duplicates until all of them close.
-- exec() keeps this backfill and trigger installation in one transaction.
lock table service_requests,calls,assist_requests in share row exclusive mode;
create table if not exists active_service_claims (
 registration_id uuid not null references registrations(id) on delete cascade,
 service text not null check(service in ('guidance','robot','mobility')),
 owner_id text,
 primary key(registration_id,service)
);
insert into active_service_claims(registration_id,service,owner_id)
 select registration_id,service,case when count(*)=1 then min(id) else null end
 from request_work_ledger where registration_id is not null
 and state in ('received','assigned','en_route','arrived','serving')
 group by registration_id,service on conflict do nothing;

create or replace function maintain_active_service_claim() returns trigger language plpgsql as $$
declare
 old_reg uuid; new_reg uuid; old_service text; new_service text;
 old_live boolean:=false; new_live boolean:=false; owner text; prefix text;
begin
 prefix:=case TG_TABLE_NAME when 'calls' then 'call:' when 'assist_requests' then 'assist:' else '' end;
 if TG_OP<>'INSERT' then
  old_reg:=OLD.registration_id;
  if TG_TABLE_NAME='calls' then old_service:='guidance'; old_live:=OLD.ended_at is null;
  elsif TG_TABLE_NAME='assist_requests' then old_service:='mobility';old_live:=OLD.state in ('received','assigned','moving');
  else old_service:=OLD.service;old_live:=OLD.state in ('received','assigned','en_route','arrived','serving');
  end if;
  owner:=prefix||OLD.id::text;
 end if;
 if TG_OP<>'DELETE' then
  new_reg:=NEW.registration_id;
  if TG_TABLE_NAME='calls' then new_service:='guidance';new_live:=NEW.ended_at is null;
  elsif TG_TABLE_NAME='assist_requests' then new_service:='mobility';new_live:=NEW.state in ('received','assigned','moving');
  else new_service:=NEW.service;new_live:=NEW.state in ('received','assigned','en_route','arrived','serving');
  end if;
 end if;
 if (old_reg is not null or new_reg is not null) and
  (old_live<>new_live or new_reg is distinct from old_reg or new_service is distinct from old_service) then
  -- A kiosk may replace its waiting passenger; lock old/new keys in the same order.
  perform 1 from active_service_claims c where
   (c.registration_id=old_reg and c.service=old_service) or
   (c.registration_id=new_reg and c.service=new_service)
   order by c.registration_id,c.service for update;
 end if;
 if old_reg is not null and old_live and
  (not new_live or new_reg is distinct from old_reg or new_service is distinct from old_service) then
  -- Serializes concurrent closure of quarantined historic duplicates.
  perform 1 from active_service_claims where registration_id=old_reg and service=old_service for update;
  delete from active_service_claims c where c.registration_id=old_reg and c.service=old_service
   and (c.owner_id=owner or (c.owner_id is null and not exists(
    select 1 from request_work_ledger w where w.registration_id=old_reg and w.service=old_service
    and w.state in ('received','assigned','en_route','arrived','serving')
   )));
 end if;
 if new_reg is not null and new_live and
  (not old_live or new_reg is distinct from old_reg or new_service is distinct from old_service) then
  insert into active_service_claims(registration_id,service,owner_id)
   values(new_reg,new_service,prefix||NEW.id::text);
 end if;
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
drop trigger if exists active_service_claim_trigger on service_requests;
create trigger active_service_claim_trigger after insert or update or delete on service_requests
 for each row execute function maintain_active_service_claim();
drop trigger if exists active_service_claim_trigger on calls;
create trigger active_service_claim_trigger after insert or update or delete on calls
 for each row execute function maintain_active_service_claim();
drop trigger if exists active_service_claim_trigger on assist_requests;
create trigger active_service_claim_trigger after insert or update or delete on assist_requests
 for each row execute function maintain_active_service_claim();

-- Anonymous paired-method study measurements; prototype trials only.
create table if not exists support_studies (
 id uuid primary key default gen_random_uuid(),
 channel text not null check(channel in ('phone','web')),
 task text not null check(task in ('guidance','mobility','facility')),
 seconds integer not null check(seconds between 1 and 7200),
 relays integer not null check(relays between 0 and 50),
 repeated integer not null check(repeated between 0 and 50),
 completed boolean not null, at timestamptz not null default now()
);

-- Every appointment mutation has an atomic state audit, including maintenance.
create or replace function audit_support_visit() returns trigger language plpgsql as $$
begin
 insert into support_visit_history(visit_id,version,action,actor,at,reason)
 values(new.id,new.version,case when tg_op='INSERT' then 'book' when old.state is distinct from new.state then new.state else 'updated' end,'system',new.updated_at,new.notice) on conflict do nothing;
 return new;
end $$;
drop trigger if exists support_visit_audit on support_visits;
create trigger support_visit_audit after insert or update on support_visits for each row execute function audit_support_visit();

-- Fulfilment is authoritative for ownership and terminal state; visits are its appointment view.
create or replace function sync_support_fulfilment() returns trigger language plpgsql as $$
declare next_state text;
begin
 if NEW.visit_id is null then return NEW; end if;
 next_state:=case when NEW.last_action='missed' then 'missed' when NEW.state='done' then 'done' when NEW.state in ('cancelled','expired','unavailable') then 'cancelled' else null end;
 update support_visits set assigned_crew=NEW.assigned_crew,
  state=coalesce(next_state,state),ended_at=case when next_state is not null then coalesce(ended_at,NEW.ended_at,NEW.updated_at) else ended_at end,
  updated_at=NEW.updated_at,version=version+1
 where id=NEW.visit_id and (assigned_crew is distinct from NEW.assigned_crew or (next_state is not null and state<>next_state));
 return NEW;
end $$;
drop trigger if exists sync_support_fulfilment_trigger on service_requests;
create trigger sync_support_fulfilment_trigger after update on service_requests for each row execute function sync_support_fulfilment();
create or replace function release_support_resource() returns trigger language plpgsql as $$
begin
 if NEW.state in ('done','cancelled','missed','handed_over') and NEW.state is distinct from OLD.state then
  update support_resource_holds set active=false,release_at=NEW.updated_at+interval '5 minutes',updated_at=NEW.updated_at where visit_id=NEW.id and active;
 end if;
 return NEW;
end $$;
drop trigger if exists release_support_resource_trigger on support_visits;
create trigger release_support_resource_trigger after update on support_visits for each row execute function release_support_resource();

create unique index if not exists one_active_work_per_crew on service_requests(assigned_crew) where assigned_crew is not null and planned_at is null and state in ('received','assigned','en_route','arrived','serving');

-- Ended appointments never keep personal fulfilment details until a formerly scheduled future date.
create or replace function retain_support_work() returns trigger language plpgsql as $$
begin
 if NEW.visit_id is not null and NEW.state in ('done','cancelled','expired','unavailable') then
  NEW.planned_at:=null;
  NEW.expires_at:=least(NEW.expires_at,coalesce(NEW.ended_at,NEW.updated_at)+interval '24 hours');
 end if;
 return NEW;
end $$;
drop trigger if exists retain_support_work_trigger on service_requests;
create trigger retain_support_work_trigger before update on service_requests for each row execute function retain_support_work();

-- Additive upgrade for reservations already created by the previous deployment.
update support_visits set state='checked_in',notice='운영 연결을 갱신했습니다. 안내 시작을 다시 선택해 주세요.',updated_at=now(),version=version+1
 where state='responding' and request_id is null and resource_id is null;
insert into service_requests(id,receipt_hash,service,state,place_id,choices,party,note,lang,source,created_at,updated_at,expires_at,device_key,last_action,topic_id,business_id,service_details,visit_id,planned_at,target_zone)
 select v.id,v.receipt_hash,v.service,
  case when v.state='done' then 'done' when v.state in ('cancelled','missed') then 'cancelled' else 'received' end,
  h.place_id,v.choices,v.party,v.recognition,v.lang,'web',v.created_at,v.updated_at,
  least(v.start_at+interval '24 hours',coalesce(v.ended_at+interval '24 hours',v.start_at+interval '24 hours')),
  v.device_key,'baseline',case when v.service='robot' then 'robot' else 'mobility' end,'passenger-terminal',
  jsonb_build_object('task',case when v.service='robot' then 'robot-visit' when v.task='wheelchair' then 'mobility-wheelchair' else 'mobility-escort' end,'fields','{}'::jsonb),
  v.id,case when v.state='booked' then v.start_at else null end,h.zone_id
 from support_visits v join (values
  ('t1-departure','t1-info','desk-t1'),('t1-care','t1-care','desk-t1'),('t1-airside','t1-center','t1-c'),
  ('concourse','cc-center','cc-center'),('t2-departure','t2-help','desk-t1'),('t2-airside','t2-center','t2-mid')
 ) h(hub_id,place_id,zone_id) on h.hub_id=v.hub_id
 where v.request_id is null
 on conflict do nothing;
update service_requests r set visit_id=v.id,planned_at=case when v.state='booked' then v.start_at else r.planned_at end
 from support_visits v where (r.id=v.request_id or r.receipt_hash=v.receipt_hash) and r.visit_id is null;
update support_visits v set request_id=r.id,handed_over_at=case when v.state='handed_over' then coalesce(v.handed_over_at,v.updated_at) else v.handed_over_at end
 from service_requests r where r.visit_id=v.id and (v.request_id is distinct from r.id or (v.state='handed_over' and v.handed_over_at is null));

update service_requests r set target_zone=h.zone_id from support_visits v join (values
 ('t1-departure','desk-t1'),('t1-care','desk-t1'),('t1-airside','t1-c'),
 ('concourse','cc-center'),('t2-departure','desk-t1'),('t2-airside','t2-mid')
 ) h(hub_id,zone_id) on h.hub_id=v.hub_id where r.visit_id=v.id and r.target_zone is null;
-- Legacy owner labels are advisory; actual work ownership becomes authoritative on upgrade.
update support_visits v set assigned_crew=r.assigned_crew from service_requests r
 where r.visit_id=v.id and v.assigned_crew is distinct from r.assigned_crew;
