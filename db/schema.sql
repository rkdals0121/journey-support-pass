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
create or replace view request_work_ledger as
select id::text,id as source_id,'integrated'::text as queue,registration_id,service,state,place_id,choices,party,note,lang,source,
 assigned_zone,reason,created_at,updated_at,expires_at,version::double precision as version,
 accepted_at,arrived_at,started_at,ended_at,registration_linked
from service_requests
union all
select 'call:'||c.id::text,c.id,'call',c.registration_id,'guidance',
 case when c.ended_at is null then case when c.accepted_at is null then 'received' else 'serving' end
 when c.end_kind='done' then 'done'
 when c.end_kind='expired' then 'expired' else 'cancelled' end,
 c.place_id,coalesce(r.needs,'{}'::text[]),coalesce(r.party_size,1),coalesce(r.note,''),coalesce(r.lang,'ko'),'kiosk',
 c.accepted_zone,''::text,c.created_at,coalesce(c.ended_at,c.accepted_at,c.created_at),c.created_at+interval '24 hours',
 (extract(epoch from c.created_at)*10000+case when c.ended_at is not null then 2 when c.accepted_at is not null then 1 else 0 end)::double precision,
 c.accepted_at,null::timestamptz,c.accepted_at,c.ended_at,c.registration_linked
from calls c left join registrations r on r.id=c.registration_id and r.status in ('active','pending')
union all
select 'assist:'||a.id::text,a.id,'assist',a.registration_id,'mobility',
 case when a.state='moving' then 'serving' when a.end_kind='expired' then 'expired' else a.state end,
 coalesce(a.place_id,''),coalesce(r.needs,'{}'::text[]),coalesce(r.party_size,1),coalesce(r.note,''),coalesce(r.lang,'ko'),
 case when a.place_id is null then 'web' else 'kiosk' end,a.assigned_zone,''::text,a.created_at,
 coalesce(a.ended_at,a.assigned_at,a.created_at),a.created_at+interval '24 hours',
 (extract(epoch from a.created_at)*10000+case a.state when 'received' then 0 when 'assigned' then 1 when 'moving' then 2 else 3 end)::double precision,
 a.assigned_at,null::timestamptz,null::timestamptz,a.ended_at,a.registration_linked
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
alter table service_requests add column if not exists resource_id uuid references dispatch_resources(id);
create unique index if not exists one_active_request_per_resource on service_requests(resource_id)
 where resource_id is not null and state in ('received','assigned','en_route','arrived','serving');

-- Serialize allocation and inventory status changes on the resource row. All statements
-- inside these functions share one transaction; history-trigger failures roll back allocation.
create or replace function allocate_dispatch_resource(
 p_request uuid,p_version int,p_resource uuid,p_actor text,p_desk boolean,p_now timestamptz
) returns text language plpgsql as $$
declare gear dispatch_resources%rowtype; job service_requests%rowtype;
begin
 if p_resource is not null then
  select * into gear from dispatch_resources where id=p_resource for update;
  if not found then return 'resource_missing'; end if;
  if gear.status<>'ready' then return 'not_ready'; end if;
  if not exists(select 1 from zones where id=gear.zone_id and active) then return 'not_ready'; end if;
 end if;
 select * into job from service_requests where id=p_request for update;
 if not found or job.expires_at<=p_now then return 'request_missing'; end if;
 if job.version<>p_version then return 'stale'; end if;
 if not p_desk and job.assigned_zone is distinct from p_actor then return 'forbidden'; end if;
 if job.state<>'assigned' then return 'stage'; end if;
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
create or replace function enqueue_request_alert() returns trigger language plpgsql as $$
begin
 insert into request_alerts(request_id,created_at,expires_at)
 values(NEW.id,NEW.created_at,NEW.created_at+interval '10 minutes');
 insert into request_alert_deliveries(request_id,subscription_id,zone_id,next_attempt_at)
 select NEW.id,s.id,s.zone_id,NEW.created_at from request_push_subscriptions s
 where s.expires_at>NEW.created_at;
 return NEW;
end $$;
drop trigger if exists enqueue_request_alert_trigger on service_requests;
create trigger enqueue_request_alert_trigger after insert on service_requests
 for each row execute function enqueue_request_alert();

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
