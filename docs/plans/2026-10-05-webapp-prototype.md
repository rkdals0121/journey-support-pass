# Journey Support Pass 웹앱 시제품 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여객 등록, 안내데스크 패스 연결, 현장 직원 스캔·응대, 5분 주기 운항 수집, 출발 후 자동 삭제가 모의 데이터로 끝까지 작동하는 웹앱 시제품을 만든다.

**Architecture:** Next.js 서버가 모든 DB 접근을 맡고 브라우저는 DB에 직접 닿지 않는다. 업무 규칙은 `src/lib`의 순수 함수와 서비스 함수에 두고, 서비스 함수는 `Db`와 `now`를 인자로 받아 테스트에서 시각과 DB를 바꿔 끼운다. DB는 Postgres이며, 계정 없이 로컬과 테스트에서 돌도록 PGlite(프로세스 내장 Postgres)를 기본으로 쓰고 `DATABASE_URL`이 있으면 Supabase에 붙는다.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Postgres (`pg` / `@electric-sql/pglite`), Vitest, `jsqr`, `qrcode`. 스타일은 전역 CSS 한 파일.

**Spec:** `docs/spec.md` (원본: `../본선 (10월)/웹앱_개발_명세.md`. Task 1에서 복사한다.)

## Global Constraints

- 프로젝트 위치: 공모전 폴더 아래 `journey-support-pass/`. 운항 조회 웹 저장소와 분리한다.
- 브라우저 코드는 DB에 접속하지 않는다. 클라이언트 컴포넌트에서 `src/lib/db.ts`를 가져오지 않는다.
- 모든 서비스 함수는 `now: Date`를 인자로 받는다. 서비스 코드에서 `new Date()`를 직접 부르지 않는다. 호출은 경로 처리기에서만 한다.
- 시각은 DB에 `timestamptz`로 저장한다. 운항 API의 `YYYYMMDDHHmm`은 한국 시각(+09:00)으로 해석한다.
- 직원은 구역으로만 기록한다. 직원 이름, 사번, 기기 식별값을 저장하지 않는다. 차단 판정용 기기 키는 IP와 User-Agent의 SHA-256 해시만 쓴다.
- 설정 기본값 (모두 `src/lib/config.ts` 한 곳): 탑승 마감 = 출발 10분 전, 임박 = 마감 30분 이내, 운항 지연 경고 = 15분, 출발 후 삭제 = 30분, 안전장치 삭제 = 예정 출발 24시간, 로그인 유지 = 12시간, 입력 실패 5회 → 10분 차단, 여객 카드 자동 닫힘 = 120초, 화면 목록 갱신 = 30초, 운항 수집 = 5분.
- 선택 항목의 문구와 순서는 spec 4.2의 표와 글자 하나까지 같아야 한다.
- 화면 문구는 한국어. spec에 적힌 안내 문구("직원 전용 화면입니다" 등)는 그대로 쓴다.
- `DATA_MODE` 기본값은 `mock`. `mock`이면 모든 화면 위에 "시범 운영 · 모의 데이터" 띠를 띄운다.
- 커밋 메시지는 운항 조회 웹과 같은 형식(`feat:`, `fix:`, `docs:`, `chore:`, `test:` + 한국어)을 쓴다.

## File Structure

```
journey-support-pass/
  db/schema.sql                 테이블 정의 (전체)
  db/seed-zones.json            구역, 탑승구, 시설, 시범용 접속 코드
  scripts/seed.ts               구역·패스·모의 운항 적재
  scripts/probe-poll.ts         spec 10장: 5분 간격 수집 실측 기록
  scripts/print-passes.ts       패스 QR 인쇄용 HTML 생성
  src/lib/config.ts             설정값
  src/lib/db.ts                 Db 인터페이스, PGlite/pg 어댑터, migrate
  src/lib/catalog.ts            선택 항목 코드·문구, 지원 종류 환산
  src/lib/timing.ts             탑승 마감 추정, 남은 시간, 임박 판정
  src/lib/zones.ts              탑승구 → 구역
  src/lib/auth.ts               접속 코드 검증, 세션 쿠키, 차단, 조회 기록
  src/lib/flights/normalize.ts  API 응답 행 → FlightRow
  src/lib/flights/fetch.ts      공공데이터 호출
  src/lib/flights/ingest.ts     flights 덮어쓰기, 탑승구 변경 추적, 수집 기록
  src/lib/flights/search.ts     편명 검색 (오늘·내일, 공동운항)
  src/lib/registrations.ts      등록 생성, 접수 번호 발급·조회
  src/lib/passes.ts             패스 생성·연결·분기·재발급
  src/lib/encounters.ts         스캔·응대 기록, 구역 목록
  src/lib/purge.ts              삭제 작업
  src/app/...                   화면과 경로 처리기 (Task 11~13)
  tests/helpers/db.ts           테스트용 메모리 DB
  tests/*.test.ts               lib 모듈별 테스트
```

---

### Task 1: 프로젝트 뼈대와 DB 계층

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `db/schema.sql`, `src/lib/db.ts`, `src/lib/config.ts`, `tests/helpers/db.ts`, `tests/db.test.ts`
- Create: `docs/spec.md` (원본 명세 복사), `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces — Produces:**

```ts
// src/lib/db.ts
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}
export function getDb(): Promise<Db>;          // DATABASE_URL 있으면 pg, 없으면 PGlite(.data/pglite). 프로세스당 하나
export function migrate(db: Db): Promise<void>; // db/schema.sql 실행. 여러 번 실행해도 안전

// tests/helpers/db.ts
export function createTestDb(): Promise<Db>;   // 메모리 PGlite + migrate

// src/lib/config.ts
export const config: {
  dataMode: "mock" | "live";
  boardingCloseMin: 10; urgentMin: 30; staleMin: 15;
  purgeAfterDepartureMin: 30; purgeSafetyHours: 24; unlinkedPurgeHours: 24;
  sessionHours: 12; lockMaxFails: 5; lockMinutes: 10;
  cardTimeoutSec: 120; listRefreshSec: 30; pollMin: 5; logRetentionDays: 90;
  sessionSecret: string; cronSecret: string; icnApiKey: string;
};
```

- [ ] **Step 1: 뼈대 생성.** `npx create-next-app@15 . --ts --app --src-dir --no-tailwind --eslint --use-npm --import-alias "@/*"` 실행 후 `npm i pg @electric-sql/pglite jsqr qrcode` 와 `npm i -D vitest @types/pg @types/qrcode tsx`. `package.json` scripts에 `"test": "vitest run"`, `"seed": "tsx scripts/seed.ts"` 추가. `.gitignore`에 `.data/`, `.env*.local`, `out/` 추가. `git init`.

- [ ] **Step 2: `db/schema.sql` 작성.**

```sql
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
```

- [ ] **Step 3: 실패하는 테스트 작성** (`tests/db.test.ts`): `createTestDb()` 후 (a) 7개 테이블이 `information_schema.tables`에 있다, (b) `migrate`를 두 번 불러도 오류가 없다, (c) `receipt_no`가 같은 `pending` 등록 두 건을 넣으면 두 번째가 거부되고, 첫 건을 `active`로 바꾸면 같은 번호의 새 `pending` 건이 들어간다.
- [ ] **Step 4:** `npm test` → `createTestDb` 없음으로 실패 확인.
- [ ] **Step 5: `src/lib/db.ts`, `tests/helpers/db.ts`, `src/lib/config.ts` 구현.** PGlite 어댑터는 `new PGlite(dir)`의 `db.query(sql, params)` 결과에서 `.rows`를 돌려준다. `migrate`는 `db.exec`로 여러 문장을 한 번에 실행해야 하므로 `Db`에 내부용 `exec?(sql)`을 두고, pg 어댑터는 `pool.query(sql)`로 처리한다. PGlite는 `int[]`, `text[]`, `jsonb`, `gen_random_uuid()`를 지원한다.
- [ ] **Step 6:** `npm test` 통과, `npm run build` 통과 확인.
- [ ] **Step 7:** 원본 명세를 `docs/spec.md`로 복사. 커밋 `chore: 프로젝트 뼈대와 DB 계층`.

---

### Task 2: 선택 항목 목록

**Files:** Create `src/lib/catalog.ts`, `tests/catalog.test.ts`

**Interfaces — Produces:**

```ts
export type Group = "category" | "move" | "comm" | "env" | "accompany";
export interface Item { code: string; label: string; group: Group }
export const ITEMS: Item[];                     // spec 4.2 표의 19개, 표 순서 그대로
export const GROUP_LABEL: Record<Group, string>; // 교통약자 구분 / 이동 / 감각·소통 / 환경 / 동반
export function itemsOf(group: Group): Item[];
export function labelOf(code: string): string;
export function validateSelection(categories: string[], needs: string[]): string | null; // 오류 문구 또는 null
export function supportGroups(needs: string[]): string[]; // ['이동','감각·소통'] 형태, 표 순서, 중복 없음
```

- [ ] **Step 1: 실패하는 테스트.** (a) `ITEMS.length === 19`이고 코드가 중복되지 않는다. (b) `itemsOf("category")`의 문구가 순서대로 `["장애가 있습니다","고령자입니다","임신 중입니다","영유아와 함께합니다","어린이와 함께합니다"]`. (c) `supportGroups(["com_slow","mov_no_stairs","mov_escort"])` → `["이동","감각·소통"]`. (d) `validateSelection([], [])` → 오류, `validateSelection(["cat_senior"], [])` → `null` (구분 하나 이상이면 통과), `validateSelection(["mov_escort"], [])` → 오류(구분 칸에 다른 묶음 코드), `validateSelection(["cat_senior"], ["nope"])` → 오류.
- [ ] **Step 2:** 실패 확인 → 구현 → 통과 확인.
- [ ] **Step 3:** 커밋 `feat: 선택 항목 목록과 지원 종류 환산`.

---

### Task 3: 운항 수집

**Files:** Create `src/lib/flights/normalize.ts`, `src/lib/flights/fetch.ts`, `src/lib/flights/ingest.ts`, `scripts/probe-poll.ts`, `src/app/api/cron/poll-flights/route.ts`, `tests/flights-normalize.test.ts`, `tests/flights-ingest.test.ts`, `tests/fixtures/departures.json`

**참고:** 운항 조회 웹 `scripts/collect.py`의 `FIELD_MAP`, `TERMINAL_CODE`, `normalize`, `parse`를 그대로 옮긴다. 그 파일 주석에 따르면 이 API는 날짜 인자와 무관하게 D-3~D+6 전체를 돌려줄 수 있다. 그래서 수집 결과에서 오늘과 내일(한국 날짜) 출발편만 남긴다.

**Interfaces — Produces:**

```ts
// normalize.ts
export interface FlightRow {
  flightDate: string;   // YYYY-MM-DD (예정 출발의 한국 날짜)
  flightNo: string; masterNo: string; airline: string;
  destCode: string; destName: string;
  terminal: "T1" | "CONCOURSE" | "T2" | "";
  gate: number | null;
  schedAt: Date; estAt: Date | null; status: string;
}
export function parseKst(s: string): Date | null;                 // "202609231430" → 2026-09-23T05:30:00Z
export function kstDate(d: Date): string;                         // Date → "YYYY-MM-DD" (한국 날짜)
export function normalizeRow(raw: Record<string, unknown>): FlightRow | null; // 편명·예정 시각 없으면 null
export function parseResponse(text: string): Record<string, unknown>[];

// fetch.ts
export function fetchDepartures(apiKey: string, now: Date): Promise<Record<string, unknown>[]>; // 페이지 반복, 1000행 단위

// ingest.ts
export function ingestFlights(db: Db, rows: FlightRow[], now: Date): Promise<{ upserted: number; gateChanges: number }>;
export function recordPoll(db: Db, p: { at: Date; ok: boolean; rowCount: number; durationMs: number; gateChanges: number; error?: string }): Promise<void>;
export function lastSuccessfulPoll(db: Db): Promise<Date | null>;
```

- [ ] **Step 1:** 운항 조회 웹 `data/flights/2026-09-23.json`에서 출발편 5건을 골라 API 원본 필드 이름(`flightId`, `masterflightid`, `gatenumber`, `terminalid`, `scheduleDateTime`, `estimatedDateTime`, `airportCode`, `airport`, `airline`, `remark`)으로 되돌린 `tests/fixtures/departures.json`을 만든다. 공동운항 1건, 탑승구 빈 값 1건, 탑승동(`P02`) 1건을 포함한다.
- [ ] **Step 2: 실패하는 테스트 (normalize).** (a) `parseKst("202609231430")?.toISOString() === "2026-09-23T05:30:00.000Z"`, `parseKst("")`와 `parseKst("abc")`는 `null`. (b) `kstDate(new Date("2026-09-23T15:30:00Z")) === "2026-09-24"`. (c) `terminalid: "P02"` → `terminal === "CONCOURSE"`. (d) `gatenumber: ""` → `gate === null`, `"112"` → `112`. (e) 편명 없는 행 → `null`. (f) `parseResponse`가 `response.body.items`가 배열인 경우, `items.item`이 배열인 경우, 객체 하나인 경우를 모두 배열로 돌려준다.
- [ ] **Step 3: 실패하는 테스트 (ingest).** (a) 3건 적재 → `upserted: 3`, 테이블 3행. (b) 같은 편을 탑승구 112 → 118로 다시 적재 → `gateChanges: 1`, `gate = 118`, `prev_gate = 112`, `gate_changed_at = now`. (c) 탑승구 `null` → 112는 변경으로 세지 않고 `prev_gate`는 `null`. (d) 같은 탑승구로 다시 적재해도 `gate_changed_at`이 유지된다. (e) `recordPoll` 실패 2건 뒤 성공 1건 → `lastSuccessfulPoll`이 성공 시각.
- [ ] **Step 4:** 실패 확인 → `normalize.ts`, `ingest.ts` 구현 → 통과 확인. upsert는 `insert ... on conflict (flight_date, flight_no) do update`로 하고, `prev_gate`와 `gate_changed_at`은 `case when flights.gate is not null and excluded.gate is not null and flights.gate <> excluded.gate then ... else 기존 값 end`로 처리한다.
- [ ] **Step 5: `fetch.ts` 구현.** 주소 `https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDeOdp/getPassengerDeparturesDeOdp`, 인자 `serviceKey`, `numOfRows=1000`, `pageNo`, `search_begin_dt`, `search_end_dt`(오늘 `YYYYMMDD`), `type=json`, `lang=K`. 요청당 제한 시간 60초, 실패 시 2회 재시도. 받은 행이 1000 미만이면 멈추고 최대 30쪽까지만 받는다.
- [ ] **Step 6: 경로 처리기.** `GET /api/cron/poll-flights`는 `Authorization: Bearer ${config.cronSecret}`가 아니면 401. 통과하면 `fetchDepartures` → `normalizeRow` → 오늘·내일 한국 날짜만 남김 → `ingestFlights` → `recordPoll`. 예외가 나면 `recordPoll({ ok: false, error })` 후 500.
- [ ] **Step 7: `scripts/probe-poll.ts`.** 5분마다 `fetchDepartures`를 불러 `out/probe-YYYYMMDD.jsonl`에 `{ at, ok, pages, rows, todayRows, durationMs, gateChanges, error }`를 한 줄씩 쓴다. 탑승구 변경은 직전 회차와 메모리에서 비교한다. `ICN_API_KEY`가 없으면 안내 문구를 찍고 끝낸다. 실행: `npx tsx scripts/probe-poll.ts`.
- [ ] **Step 8:** `npm test` 통과. 커밋 `feat: 운항 수집과 탑승구 변경 추적`.

---

### Task 4: 시간 계산

**Files:** Create `src/lib/timing.ts`, `tests/timing.test.ts`

**Interfaces — Produces:**

```ts
export interface FlightTimes { schedAt: Date; estAt: Date | null; status: string }
export function departureAt(f: FlightTimes): Date;                 // estAt ?? schedAt
export function boardingCloseAt(f: FlightTimes): Date;             // departureAt − config.boardingCloseMin
export function minutesToClose(f: FlightTimes, now: Date): number; // 내림, 음수 가능
export function isCancelled(f: FlightTimes): boolean;              // status에 "결항" 포함
export function isDeparted(f: FlightTimes): boolean;               // status에 "출발" 포함
export function isDelayed(f: FlightTimes): boolean;                // estAt이 schedAt보다 늦음
export function isUrgent(f: FlightTimes, now: Date): boolean;      // 결항 아님, minutesToClose <= config.urgentMin
export function pollState(lastOk: Date | null, now: Date): { label: string; stale: boolean };
// label 예: "운항 정보 14:35 기준" (한국 시각), lastOk가 null이면 "운항 정보 없음", stale은 15분 초과 또는 null
```

- [ ] **Step 1: 실패하는 테스트.** 예정 14:30(KST), 변경 없음, 현재 13:50 → 마감 14:20, 남은 30분, 임박 `true`. 현재 13:49 → 31분, 임박 `false`. 변경 15:10 → 마감 15:00, `isDelayed` `true`. 현재 14:25, 변경 없음 → 남은 −5. 예정 00:20, 현재 전날 23:50 → 남은 20 (자정 넘김). 상태 "결항" → `isUrgent` `false`. `pollState`: 마지막 성공이 15분 전 → `stale: false`, 15분 1초 전 → `true`, `null` → `true`.
- [ ] **Step 2:** 실패 확인 → 구현 → 통과 → 커밋 `feat: 탑승 마감 추정과 운항 정보 신선도`.

---

### Task 5: 구역

**Files:** Create `db/seed-zones.json`, `src/lib/zones.ts`, `tests/zones.test.ts`

**구역 자료:** `db/seed-zones.json`은 `{ id, terminal, label, band, gates, facilities, code, isDesk, active }` 배열이다.

- 제2여객터미널 5개 구역: 운항 조회 웹 `data/zones.json`의 `T2.zones`를 그대로 (검증된 값).
- 제1여객터미널 3개 구역: 같은 파일의 `T1.zones` (추정치, `active: false`).
- 탑승동 3개 구역 `cc-center`(중앙부), `cc-mid`(중간), `cc-end`(끝단): 끝단 12개 탑승구 목록은 팀 집계 담당이 준 값을 넣는다. 받기 전에는 탑승동 탑승구 101~132를 중앙에서 먼 순서로 나눈 임시값(끝단 101~106, 127~132 / 중간 107~110, 123~126 / 중앙부 111~122)을 넣고 파일 맨 위 `_note`에 "임시값, 팀 집계로 교체 필요"라고 적는다.
- 안내데스크 구역 `desk-t1`(`isDesk: true`, 탑승구 없음).
- `code`는 시범용 평문 접속 코드이고 seed 때 해시로 바꿔 저장한다. 이 파일의 코드는 모의 시범 전용이다.
- `facilities`는 빈 배열로 시작하고 구역 지원환경표가 나오면 채운다.

**Interfaces — Produces:**

```ts
export interface Zone { id: string; terminal: string; label: string; band: string | null; gates: number[];
  facilities: { elevators: string[]; restrooms: string[]; waitingPoints: string[] }; isDesk: boolean }
export function getZone(db: Db, id: string): Promise<Zone | null>;
export function zoneForGate(db: Db, terminal: string, gate: number): Promise<Zone | null>; // active 구역만
export function seedZones(db: Db, hash: (code: string) => string): Promise<number>;       // seed-zones.json 적재 (upsert)
```

- [ ] **Step 1: 실패하는 테스트.** seed 후 (a) `zoneForGate("T2", 220)` → `t2-wam`. (b) `zoneForGate("CONCOURSE", 101)?.band === "끝단"`. (c) 비활성 구역의 탑승구(T1 10번)는 `null`. (d) 한 탑승구가 두 active 구역에 속하지 않는다(seed 파일 전체 검사). (e) `seedZones`를 두 번 실행해도 행 수가 같다.
- [ ] **Step 2:** 실패 확인 → 구현 → 통과 → 커밋 `feat: 구역과 탑승구 대응`.

---

### Task 6: 로그인, 세션, 차단, 조회 기록

**Files:** Create `src/lib/auth.ts`, `tests/auth.test.ts`

**Interfaces — Produces:**

```ts
export interface Session { zoneId: string; isDesk: boolean; exp: number } // exp: epoch ms
export function hashCode(code: string): string;                 // scrypt, "salt:hash" 16진수
export function verifyCode(code: string, stored: string): boolean; // timingSafeEqual
export function deviceKey(ip: string, userAgent: string): string;  // sha256 16진수
export function signSession(s: Session): string;                // base64url(payload) + "." + HMAC-SHA256(config.sessionSecret)
export function readSession(token: string | undefined, now: Date): Session | null; // 서명 불일치·만료면 null
export type LogAction = "scan_view" | "number_view" | "receipt_view" | "link" | "reissue" | "login_fail" | "number_fail";
export function logAccess(db: Db, e: { at: Date; zoneId?: string; deviceKey?: string; action: LogAction; registrationId?: string }): Promise<void>;
export function isLocked(db: Db, device: string, failAction: "login_fail" | "number_fail", now: Date): Promise<boolean>;
// 최근 config.lockMinutes 안에 failAction이 config.lockMaxFails건 이상이면 true
export function login(db: Db, code: string, device: string, now: Date):
  Promise<{ ok: true; token: string; session: Session } | { ok: false; reason: "locked" | "invalid" }>;
// 모든 active 구역의 code_hash와 대조. 틀리면 login_fail 기록
```

쿠키 이름은 `jsp_session`, 속성은 `httpOnly`, `sameSite=lax`, `secure`(운영), `path=/`, `maxAge = 12시간`. 쿠키 읽기·쓰기는 경로 처리기에서 `next/headers`로 한다.

- [ ] **Step 1: 실패하는 테스트.** (a) `verifyCode("abc", hashCode("abc"))` `true`, 다른 코드는 `false`, 같은 코드를 두 번 해시하면 결과가 다르다. (b) `signSession` → `readSession`이 같은 값을 돌려주고, 한 글자를 바꾸면 `null`, `exp`가 지나면 `null`. (c) 올바른 코드로 `login` → `ok`, `session.zoneId`가 그 구역, `exp = now + 12시간`. (d) 틀린 코드 5회 → 6번째는 올바른 코드여도 `reason: "locked"`. (e) 11분 뒤에는 다시 로그인된다. (f) 다른 `deviceKey`는 차단되지 않는다.
- [ ] **Step 2:** 실패 확인 → 구현 → 통과 → 커밋 `feat: 구역 접속 코드 로그인과 입력 차단`.

---

### Task 7: 등록과 편명 검색

**Files:** Create `src/lib/flights/search.ts`, `src/lib/registrations.ts`, `tests/search.test.ts`, `tests/registrations.test.ts`

**Interfaces — Produces:**

```ts
// search.ts
export interface FlightChoice { flightDate: string; flightNo: string; masterNo: string; airline: string;
  destName: string; terminal: string; gate: number | null; schedAt: Date; estAt: Date | null; status: string }
export function normalizeFlightNo(input: string): string;   // 공백·하이픈 제거, 대문자. "ke 123" → "KE123"
export function findFlights(db: Db, input: string, now: Date): Promise<FlightChoice[]>;
// 오늘·내일(한국 날짜), 이미 출발한 편과 출발 시각이 지난 편 제외, 예정 시각 순
export function getFlight(db: Db, flightDate: string, flightNo: string): Promise<FlightChoice | null>;
export function operatingFlight(db: Db, f: FlightChoice): Promise<FlightChoice>;
// masterNo가 있고 그 편이 테이블에 있으면 그 편, 없으면 f 그대로. 탑승구·시각은 이 값을 화면에 쓴다

// registrations.ts
export interface RegistrationInput { name: string; flightDate: string; flightNo: string;
  categories: string[]; needs: string[]; route: "web" | "paper" | "assisted";
  consent: boolean; startedAt: Date; editCount: number }
export interface Registration { id: string; receiptNo: string | null; name: string | null;
  flightDate: string | null; flightNo: string | null; categories: string[]; needs: string[];
  route: string; status: "pending" | "active" | "expired" | "revoked"; submittedAt: Date; linkedAt: Date | null }
export function createRegistration(db: Db, input: RegistrationInput, now: Date):
  Promise<{ ok: true; registration: Registration } | { ok: false; error: string }>;
export function findPendingByReceipt(db: Db, receiptNo: string): Promise<Registration | null>;
export function findActiveByNameAndFlight(db: Db, name: string, flightNo: string): Promise<Registration[]>; // 재발급용
export function getRegistration(db: Db, id: string): Promise<Registration | null>;
```

`createRegistration` 규칙: `consent`가 `false`면 거부("동의가 필요합니다"). 이름은 앞뒤 공백 제거 후 1~40자. `validateSelection` 통과. `getFlight`로 편이 있어야 한다. 접수 번호는 `0000`~`9999` 무작위(`crypto.randomInt`), `pending` 건과 겹쳐 고유 색인 오류가 나면 최대 20번 다시 뽑는다. `is_mock = config.dataMode === "mock"`.

- [ ] **Step 1: 실패하는 테스트 (search).** 오늘 14:30 KE123, 내일 14:30 KE123, 오늘 09:00 KE001(이미 지남), 공동운항 OZ6931(master TK091)과 TK091(탑승구 118)을 넣고 현재를 오늘 12:00으로 둔다. (a) `findFlights("ke 123")` → 2건, 오늘 것이 먼저. (b) `findFlights("KE001")` → 0건. (c) `findFlights("ZZ999")` → 0건. (d) `operatingFlight(OZ6931).gate === 118`. (e) master 편이 테이블에 없으면 자기 자신.
- [ ] **Step 2: 실패하는 테스트 (registrations).** (a) 정상 입력 → `ok`, `status: "pending"`, 접수 번호가 4자리 숫자 문자열, `submittedAt === now`. (b) `consent: false` → 오류. (c) 이름 빈 문자열 → 오류. (d) 없는 편명 → 오류. (e) `findPendingByReceipt`가 그 건을 찾고, 상태가 `active`가 되면 찾지 못한다. (f) 50건을 만들어도 `pending` 접수 번호가 겹치지 않는다.
- [ ] **Step 3:** 실패 확인 → 구현 → 통과 → 커밋 `feat: 등록과 편명 검색`.

---

### Task 8: 패스

**Files:** Create `src/lib/passes.ts`, `tests/passes.test.ts`

**Interfaces — Produces:**

```ts
export interface Pass { id: string; token: string; passNo: string; registrationId: string | null; state: "idle" | "active" | "revoked" }
export function generatePasses(db: Db, count: number): Promise<Pass[]>;
// token: crypto.randomBytes(18).toString("base64url") (24자). passNo: 겹치지 않는 4자리
export function linkPass(db: Db, token: string, registrationId: string, now: Date):
  Promise<{ ok: true } | { ok: false; error: "not_a_pass" | "pass_in_use" | "pass_revoked" | "registration_not_pending" }>;
// 성공 시 pass.state='active', registration.status='active', 양쪽 linked_at=now
export type Resolved =
  | { kind: "unknown" } | { kind: "idle"; pass: Pass } | { kind: "unusable" }
  | { kind: "active"; pass: Pass; registrationId: string };
export function resolveToken(db: Db, token: string): Promise<Resolved>;
// revoked → unusable. active인데 등록이 expired/revoked → unusable
export function resolvePassNo(db: Db, passNo: string): Promise<Resolved>; // active만 active로, 나머지는 unknown
export function reissue(db: Db, registrationId: string, newToken: string, now: Date):
  Promise<{ ok: true } | { ok: false; error: "not_a_pass" | "pass_in_use" | "pass_revoked" | "registration_not_active" }>;
// 기존 패스 state='revoked', registration_id 유지(추적용). 새 패스를 같은 등록에 연결
export function extractToken(scanned: string): string | null;
// "https://host/p/XXXX" 또는 "XXXX" → "XXXX". 형식이 다르면 null
```

- [ ] **Step 1: 실패하는 테스트.** (a) `generatePasses(20)` → 토큰 20개와 고유 일련 번호 20개가 모두 서로 다르고 토큰 길이 24. (b) `linkPass` 성공 뒤 `resolveToken` → `active`와 등록 id. (c) 연결 전 `resolveToken` → `idle`. (d) 없는 토큰 → `unknown`. (e) 사용 중인 패스를 다른 등록에 연결 → `pass_in_use`. (f) 이미 `active`인 등록에 다른 패스 연결 → `registration_not_pending`. (g) `reissue` 뒤 옛 토큰 → `unusable`, 새 토큰 → `active`. (h) `resolvePassNo`가 `idle` 고유 일련 번호에는 `unknown`. (i) `extractToken("https://x.app/p/abcDEF_123-xyz456789012")`가 토큰을 돌려주고 `"https://naver.com"`은 `null`.
- [ ] **Step 2:** 실패 확인 → 구현 → 통과 → 커밋 `feat: 패스 연결과 QR 분기, 재발급`.

---

### Task 9: 응대 기록과 구역 목록

**Files:** Create `src/lib/encounters.ts`, `tests/encounters.test.ts`

**Interfaces — Produces:**

```ts
export interface CaseView {
  registrationId: string; name: string; categories: string[]; needs: string[];
  flightNo: string;              // 여객이 입력한 편명
  operatingNo: string | null;    // 공동운항이면 실제 운항 편명
  destName: string; terminal: string;
  gate: number | null; prevGate: number | null; gateChangedAt: Date | null;
  schedAt: Date; estAt: Date | null; status: string;
  minutesToClose: number | null; // 결항이면 null
  urgent: boolean; cancelled: boolean; delayed: boolean;
  zoneId: string | null;         // 탑승구가 속한 구역
  facilities: Zone["facilities"] | null;
  openEncounterId: string | null; // 이 구역에서 시작했고 완료 전인 응대
}
export function getCase(db: Db, registrationId: string, viewerZoneId: string, now: Date): Promise<CaseView | null>; // active 등록만
export function recordScan(db: Db, registrationId: string, zoneId: string, now: Date): Promise<string>; // encounter id (scanned_at만 채움)
export function startEncounter(db: Db, encounterId: string, zoneId: string, now: Date): Promise<boolean>;
export function endEncounter(db: Db, encounterId: string, zoneId: string, now: Date): Promise<boolean>; // started_at이 있어야 true
export function listForZone(db: Db, zoneId: string, now: Date): Promise<{ assigned: CaseView[]; gateUnknown: CaseView[] }>;
// assigned: 탑승구가 이 구역 gates에 속한 active 등록, minutesToClose 오름차순, 결항은 맨 뒤
// gateUnknown: 같은 터미널이고 탑승구가 null인 active 등록
// 안내데스크 구역은 모든 active 등록을 assigned로
```

`recordScan`은 같은 등록·같은 구역에 `ended_at`이 비어 있는 기록이 있으면 새로 만들지 않고 그 id를 돌려준다. 여객 카드를 다시 열 때 기록이 불어나지 않게 하기 위해서다. 다른 구역이 스캔하면 새 기록이 생기고, 이것이 인계다.

- [ ] **Step 1: 실패하는 테스트.** 탑승동 끝단 구역, 탑승구 101(마감 20분 남음), 102(마감 90분 남음), 탑승구 미정 1건, 다른 구역 탑승구 115 1건으로 준비한다. (a) `listForZone("cc-end")` → `assigned` 2건이고 101이 먼저, `gateUnknown` 1건, 115는 없음. (b) 101 건 `urgent: true`. (c) 공동운항 등록의 `gate`는 실제 운항 편의 값이고 `operatingNo`가 채워진다. (d) `recordScan` 두 번 → 같은 id. 다른 구역에서 → 다른 id. (e) `endEncounter`를 `startEncounter` 전에 부르면 `false`. (f) 시작 → 완료 뒤 `getCase().openEncounterId`는 `null`. (g) 다른 구역이 남의 기록을 `startEncounter` → `false`. (h) `expired` 등록은 `getCase`가 `null`.
- [ ] **Step 2:** 실패 확인 → 구현 → 통과 → 커밋 `feat: 응대 기록과 구역별 여객 목록`.

---

### Task 10: 삭제 작업

**Files:** Create `src/lib/purge.ts`, `src/app/api/cron/purge/route.ts`, `tests/purge.test.ts`

**Interfaces — Produces:**

```ts
export function purge(db: Db, now: Date): Promise<{ purged: number; unlinkedPurged: number; logsDeleted: number }>;
```

대상 (spec 5.2). 판정에는 공동운항이면 실제 운항 편의 시각과 상태를 쓴다.

1. `active` 등록 중: 상태에 "출발" 포함, 또는 `departureAt + 30분 <= now`. 결항은 여기서 제외.
2. `active` 등록 중 결항: 예정 출발의 한국 날짜 다음 날 04:00(KST)이 지남.
3. `active` 등록 중: `sched_at + 24시간 <= now` (안전장치. 운항 편이 테이블에서 사라진 경우도 `submitted_at + 48시간`으로 잡는다).
4. `pending` 등록 중: `submitted_at + 24시간 <= now`.

처리 순서 (한 등록마다): ① 그 등록의 응대 기록에 `support_groups = supportGroups(needs)`, `gate_band = 탑승구 구역의 band`, `categories`를 채우고 `registration_id`를 비운다. `started_at`은 있는데 `ended_at`이 없는 기록은 그대로 둔다(집계에서 제외 대상). ② 연결된 `active` 패스를 `idle`로 되돌리고 `registration_id`와 `linked_at`을 비운다. `revoked` 패스는 `registration_id`만 비운다. ③ 등록의 `name`, `flight_date`, `flight_no`, `needs`, `receipt_no`를 비우고 `status = 'expired'`, `purged_at = now`. `categories`, `route`, 시각들은 남긴다. ④ `access_logs.registration_id`를 비운다.

마지막으로 `access_logs`와 `flight_polls`에서 90일 지난 행, `flights`에서 3일 지난 행을 지운다.

경로 처리기 `GET /api/cron/purge`는 Task 3의 수집 경로와 같은 Bearer 검사를 한다.

- [ ] **Step 1: 실패하는 테스트.** (a) 출발 29분 뒤 → 유지, 30분 뒤 → 삭제. 삭제 뒤 `name`이 `null`, `status = 'expired'`, 패스 `idle`, `resolveToken` → `idle`. (b) 지연(변경 출발 +2시간)이면 예정 시각 기준으로는 지났어도 유지된다. (c) 상태 "출발"이면 시각과 무관하게 삭제. (d) 결항은 당일 23:59에 유지, 다음 날 04:00에 삭제. (e) 삭제된 등록의 응대 기록에 `support_groups`와 `gate_band`가 채워지고 `registration_id`가 `null`. (f) 연결 안 된 `pending` 등록은 23시간에 유지, 24시간에 삭제. (g) 재발급으로 `revoked`된 패스는 `revoked`로 남는다. (h) `purge`를 연달아 두 번 불러도 두 번째는 `purged: 0`. (i) 91일 된 조회 기록이 지워진다.
- [ ] **Step 2:** 실패 확인 → 구현 → 통과 → 커밋 `feat: 출발 후 자동 삭제`.

---

### Task 11: 등록 화면

**Files:** Create `src/app/register/page.tsx`(클라이언트 컴포넌트 `RegisterFlow`를 감싼다), `src/app/register/RegisterFlow.tsx`, `src/app/register/done/page.tsx`, `src/app/api/flights/search/route.ts`, `src/app/api/registrations/route.ts`, `src/app/components/MockBanner.tsx`, `src/app/globals.css`, `tests/api-registrations.test.ts`

**Interfaces — Consumes:** `findFlights`, `createRegistration`, `ITEMS`, `itemsOf`, `GROUP_LABEL`.

**경로 처리기:**
- `GET /api/flights/search?q=KE123` → `{ flights: [{ flightDate, flightNo, airline, destName, schedAt, estAt, dayLabel: "오늘"|"내일", timeLabel: "14:30" }] }`. 탑승구는 돌려주지 않는다(공개 경로).
- `POST /api/registrations` 본문 `{ name, flightDate, flightNo, categories, needs, consent, startedAt, editCount }` → 200 `{ receiptNo }` 또는 400 `{ error }`. `route`는 서버가 `"web"`으로 고정한다. 같은 IP에서 10분에 20건을 넘으면 429.

**화면 (spec 4.2):** 한 화면에 질문 하나. 단계: 동의 → 교통약자 구분 → 필요한 도움 → 이름과 편명 → 완료.
- 단계 표시 "2 / 4", 이전·다음 버튼. 이전으로 돌아가 값을 바꾸면 `editCount`를 1 올린다.
- 동의 화면에 수집 항목, 보관 기간("항공편 출발 후 삭제"), 보는 사람("인천공항운영서비스 직원")을 적는다. "동의하지 않습니다"를 누르면 "기존 안내와 지원을 그대로 받으실 수 있습니다"를 보여주고 끝낸다.
- 선택지는 최소 56px 높이의 누르는 버튼(`role="checkbox"`, `aria-checked`), 본문 글자 18px 이상, 명도 대비 4.5:1 이상.
- 필요한 도움 화면은 묶음 제목(이동 / 감각·소통 / 환경 / 동반) 아래에 선택지를 둔다. 하나도 고르지 않아도 넘어갈 수 있다.
- 편명을 입력하고 "찾기"를 누르면 후보를 "KE123 · 뉴욕 · 오늘 14:30 출발" 형태의 버튼으로 보여준다. 결과가 없으면 "편명을 다시 확인해 주세요. 찾기 어려우면 안내데스크에서 도와드립니다."
- 완료 화면: 접수 번호 네 자리를 96px 이상으로 표시, "안내데스크에서 이 화면을 보여 주세요". 접수 번호는 `sessionStorage`에 두고 주소에 넣지 않는다.
- `MockBanner`는 `config.dataMode === "mock"`일 때 "시범 운영 · 모의 데이터" 띠를 띄운다. 루트 레이아웃에 넣는다. 모의 모드에서는 이름 입력란 아래 "실제 이름을 입력하지 마세요"를 표시한다.

- [ ] **Step 1: 실패하는 테스트** (경로 처리기 함수를 직접 호출, DB는 `createTestDb`로 주입). (a) 검색 응답에 `gate` 키가 없다. (b) 정상 등록 → 200과 4자리 `receiptNo`, DB의 `route`가 `"web"`. (c) 본문에 `route: "assisted"`를 넣어 보내도 `"web"`으로 저장된다. (d) `consent: false` → 400.
- [ ] **Step 2:** 실패 확인 → 경로 처리기 구현 → 통과. 경로 처리기는 `getDb()`를 쓰되, 테스트가 DB를 넣을 수 있도록 핵심을 `handle(db, request, now)` 함수로 빼고 `GET`/`POST`는 그것을 부른다. 이후 모든 경로 처리기가 이 형태를 따른다.
- [ ] **Step 3:** 화면 구현. `npm run seed`(Task 14 전이면 임시로 운항 2건을 넣는 스크립트)로 `npm run dev`를 띄워 등록을 끝까지 눌러 보고 접수 번호가 뜨는지 확인한다. 휴대전화 폭(375px)에서 가로 스크롤이 없는지 확인한다.
- [ ] **Step 4:** 커밋 `feat: 여객 등록 화면`.

---

### Task 12: 직원 화면

**Files:** Create `src/app/staff/login/page.tsx`, `src/app/staff/page.tsx`, `src/app/staff/StaffList.tsx`, `src/app/staff/scan/page.tsx`, `src/app/staff/scan/Scanner.tsx`, `src/app/staff/case/[id]/page.tsx`, `src/app/staff/case/[id]/CaseCard.tsx`, `src/app/p/[token]/page.tsx`, `src/app/api/staff/login/route.ts`, `src/app/api/staff/logout/route.ts`, `src/app/api/staff/list/route.ts`, `src/app/api/staff/resolve/route.ts`, `src/app/api/staff/case/[id]/route.ts`, `src/app/api/staff/encounters/[id]/route.ts`, `src/lib/session-server.ts`, `tests/api-staff.test.ts`

**Interfaces — Consumes:** `login`, `readSession`, `isLocked`, `logAccess`, `resolveToken`, `resolvePassNo`, `extractToken`, `getCase`, `recordScan`, `startEncounter`, `endEncounter`, `listForZone`, `lastSuccessfulPoll`, `pollState`.

**Produces:** `src/lib/session-server.ts`의 `requireSession(now): Promise<Session | null>`(쿠키에서 읽음)과 `requestDeviceKey(): Promise<string>`.

**경로 처리기 (로그인 외에는 세션이 없으면 401):**
- `POST /api/staff/login` `{ code }` → 성공 시 쿠키 설정 `{ zoneLabel, isDesk }`. 실패 401 `{ error: "접속 코드가 맞지 않습니다" }`, 차단 429 `{ error: "잠시 후 다시 시도해 주세요" }`.
- `POST /api/staff/logout` → 쿠키 삭제.
- `GET /api/staff/list` → `{ zoneLabel, poll: { label, stale }, assigned: CaseView[], gateUnknown: CaseView[] }`.
- `POST /api/staff/resolve` `{ scanned?: string, passNo?: string }` → `{ kind: "active", registrationId }` / `{ kind: "idle" }` / `{ kind: "unusable" }` / `{ kind: "unknown" }` / 429. `passNo`로 조회했는데 `active`가 아니면 `number_fail`을 기록하고, `isLocked(..., "number_fail")`이면 조회하지 않고 429. 성공하면 `scan_view` 또는 `number_view`를 기록한다.
- `GET /api/staff/case/[id]` → `recordScan` 후 `{ case: CaseView, encounterId, poll }`. 등록이 `active`가 아니면 404.
- `POST /api/staff/encounters/[id]` `{ action: "start" | "end" }` → `{ ok }`.

**화면:**
- `/staff/login`: 접속 코드 입력란 하나와 버튼.
- `/staff`: 맨 위 구역 이름과 `poll.label`. `poll.stale`이면 붉은 띠 "운항 정보가 늦어지고 있습니다. 전광판을 확인하세요". 목록의 각 줄은 탑승구(크게), 이름, 편명, "마감까지 23분 (추정)", 소통 방식 항목 요약. `urgent`면 줄 배경을 붉게. 아래 "탑승구 미정" 묶음. 화면 아래 고정 버튼 "QR 스캔". 30초마다 다시 불러오고, 실패하면 목록을 지우고 "연결할 수 없습니다. 구두로 확인해 주세요"를 띄운다.
- `/staff/scan`: `getUserMedia({ video: { facingMode: "environment" } })`로 카메라를 열고, `BarcodeDetector`가 있으면 그것으로, 없으면 `jsqr`로 250ms마다 프레임을 읽는다. 읽으면 `/api/staff/resolve`를 부른다. 결과별 문구: `idle` "연결되지 않은 패스입니다", `unusable` "사용할 수 없는 패스입니다", `unknown` "패스 QR이 아닙니다". 카메라 권한이 거부되면 고유 일련 번호 입력란만 보여준다. 고유 일련 번호 입력란은 항상 카메라 아래에 둔다(숫자 4자리, `inputMode="numeric"`).
- `/staff/case/[id]`: spec 4.4의 순서 그대로. ① 소통 방식(감각·소통 묶음 문구, 없으면 "별도 요청 없음") ② 교통약자 구분 ③ 이름 ④ 필요한 도움(이동·환경 묶음) ⑤ 동반자·유모차 ⑥ 편명과 출발 시각(지연이면 예정 시각에 줄을 긋고 변경 시각, 공동운항이면 "운항 편명 TK091") ⑦ 탑승구(변경됐으면 "변경됨 · 이전 112", 미정이면 "탑승구 미정") ⑧ "탑승 마감까지 23분 (추정)" 또는 "결항" ⑨ 가까운 시설 ⑩ "응대 시작" 버튼, 누른 뒤에는 "응대 완료" 버튼만 보인다. 120초 동안 조작이 없으면 `/staff`로 돌아간다.
- `/p/[token]` (서버 컴포넌트): 세션이 없으면 토큰이 있든 없든 "직원 전용 화면입니다"만 렌더링하고 DB를 조회하지 않는다. 세션이 있으면 `resolveToken` 결과에 따라 `active` → `/staff/case/{id}`로 이동(조회 기록), `idle` → 안내데스크 세션이면 `/staff/desk?token=`으로 이동, 아니면 "연결되지 않은 패스입니다", `unusable`·`unknown` → "사용할 수 없는 패스입니다".

- [ ] **Step 1: 실패하는 테스트** (`handle(db, request, now, session)` 형태로 직접 호출). (a) 세션 없이 `list` → 401. (b) `resolve`에 `active` 패스 토큰 → `kind: "active"`, `access_logs`에 `scan_view` 1건. (c) 틀린 고유 일련 번호 5회 뒤 올바른 번호 → 429. (d) `case` 조회 두 번 → 응대 기록 1건. (e) `encounters` `end`를 `start` 전에 → `ok: false`. (f) `/p/[token]`의 분기 함수 `decideTokenPage(db, token, session)`가 세션 없음 → `"staff_only"`(DB 조회 0회), 그리고 spec 4.5의 네 경우를 각각 돌려준다.
- [ ] **Step 2:** 실패 확인 → 경로 처리기와 `decideTokenPage` 구현 → 통과.
- [ ] **Step 3:** 화면 구현 후 `npm run dev`로 확인. 컴퓨터에서는 카메라 대신 고유 일련 번호 입력으로 흐름을 끝까지 눌러 본다.
- [ ] **Step 4:** 커밋 `feat: 직원 화면과 QR 분기`.

---

### Task 13: 안내데스크 화면

**Files:** Create `src/app/staff/desk/page.tsx`, `src/app/staff/desk/DeskFlow.tsx`, `src/app/api/desk/receipt/route.ts`, `src/app/api/desk/link/route.ts`, `src/app/api/desk/register/route.ts`, `src/app/api/desk/reissue/route.ts`, `tests/api-desk.test.ts`. Modify: `src/app/register/RegisterFlow.tsx`(질문 단계를 `src/app/components/RegistrationSteps.tsx`로 빼서 두 화면이 같은 컴포넌트를 쓴다)

**경로 처리기 (모두 `session.isDesk`가 아니면 403):**
- `POST /api/desk/receipt` `{ receiptNo }` → `{ registrationId, name, flightNo, destName, timeLabel, categories, needs }` 또는 404. `receipt_view` 기록.
- `POST /api/desk/link` `{ registrationId, scanned }` → `{ ok: true, passNo }` 또는 400 `{ error }`. 오류 문구: `not_a_pass` "패스 QR이 아닙니다", `pass_in_use` "이미 사용 중인 패스입니다", `pass_revoked` "사용할 수 없는 패스입니다", `registration_not_pending` "이미 패스가 연결된 등록입니다". `link` 기록.
- `POST /api/desk/register` → Task 11의 등록 본문에 `route: "paper" | "assisted"`를 더한 것. 응답 `{ registrationId }`.
- `POST /api/desk/reissue` `{ receiptNo? , name?, flightNo?, registrationId?, scanned? }`: `scanned`가 없으면 후보 목록 `{ candidates: [{ registrationId, name, flightNo }] }`, 있으면 재발급 실행. `reissue` 기록.

**화면 (spec 4.3):** 탭 세 개 — 패스 연결 / 새로 등록 / 재발급.
- 패스 연결: 접수 번호 입력 → 등록 내용 표시("여객 화면과 같은지 확인하세요") → 스캔 → "연결했습니다. 고유 일련 번호 0427".
- 새로 등록: 먼저 경로 선택(종이 체크리스트 / 직원이 대신 입력), 이어서 여객 등록과 같은 질문 단계, 끝나면 바로 스캔.
- 재발급: 이름과 편명으로 찾기 → 후보 선택 → 새 패스 스캔.
- 스캔은 Task 12의 `Scanner`를 다시 쓴다.

- [ ] **Step 1: 실패하는 테스트.** (a) 안내데스크가 아닌 세션 → 403. (b) 접수 번호 조회 → 연결 → 다시 같은 접수 번호 조회는 404. (c) `desk/register`로 만든 등록의 `route`가 `"paper"`로 저장되고 접수 번호 없이 바로 연결된다. (d) 재발급 뒤 옛 토큰 `unusable`. (e) 사용 중인 패스로 연결 → 400과 "이미 사용 중인 패스입니다".
- [ ] **Step 2:** 실패 확인 → 구현 → 통과 → 화면 확인 → 커밋 `feat: 안내데스크 화면`.

---

### Task 14: 모의 데이터, 패스 인쇄, 문서, 전체 점검

**Files:** Create `scripts/seed.ts`, `scripts/print-passes.ts`, `README.md`, `.env.example`, `docs/scenario-checklist.md`

- [ ] **Step 1: `scripts/seed.ts`.** `migrate` → `seedZones` → 패스가 없으면 `generatePasses(30)` → `--mock-flights`를 주면 지금 시각 기준으로 40분, 70분, 2시간, 3시간 뒤 출발하는 모의 운항 8편(탑승동 끝단 2, 중앙부 2, 제2터미널 2, 탑승구 미정 1, 공동운항 한 쌍)을 넣고 `flight_polls`에 성공 1건을 기록한다. 실행할 때마다 모의 운항 시각을 지금 기준으로 다시 맞춘다.
- [ ] **Step 2: `scripts/print-passes.ts`.** `idle` 패스 전부를 `out/passes.html`로 만든다. 한 장에 QR(`${BASE_URL}/p/${token}`, 오류 정정 수준 M, 25mm)과 고유 일련 번호 네 자리만 넣는다. 이름·날짜·그 밖의 글자는 넣지 않는다. A4 한 쪽에 4×6장.
- [ ] **Step 3: `README.md`.** 운항 조회 웹 README와 같은 말투로 적는다. 로컬 실행(`npm i` → `npm run seed -- --mock-flights` → `npm run dev`), 시범용 접속 코드가 있는 위치, 환경 변수 표(`DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `ICN_API_KEY`, `DATA_MODE`, `BASE_URL`), 배포(Vercel 새 프로젝트 + Supabase 서울 리전, `db/schema.sql` 실행, pg_cron과 pg_net으로 `/api/cron/poll-flights`를 5분마다, `/api/cron/purge`를 10분마다 `Authorization: Bearer` 머리말과 함께 호출하는 SQL), 실측 스크립트 사용법, "알아 둘 것"(탑승동 구역이 임시값인지, 탑승 마감이 추정값이라는 것, `DATA_MODE=live`는 기관 검토 뒤에만).
- [ ] **Step 4: `docs/scenario-checklist.md`.** spec 9장의 시나리오 7개를 단계별로 풀어 쓴다.
- [ ] **Step 5: 전체 점검.** `npm test` 전부 통과, `npm run build` 통과. `npm run seed -- --mock-flights` 후 `npm run dev`를 띄워 시나리오 1(등록 → 접수 번호 → 패스 연결 → 스캔 → 응대 시작·완료), 3(로그인 없는 브라우저로 `/p/{token}`), 4(재발급), 7(다른 구역으로 로그인해 같은 패스)을 브라우저로 직접 확인한다. 시나리오 6은 모의 운항 시각을 과거로 바꾼 뒤 `/api/cron/purge`를 호출해 확인한다.
- [ ] **Step 6:** 커밋 `docs: 실행 방법과 시나리오 점검표`.

---

## 계획에 넣지 않은 것 (사용자 결정이나 계정이 필요)

- GitHub 원격 저장소 생성과 push, Vercel·Supabase 프로젝트 생성과 배포. README에 절차만 적고, 실행은 사용자 확인 뒤 따로 한다.
- 운항 API 실측(spec 10장). 스크립트는 Task 3에서 만들지만, 인증키를 넣고 하루 돌리는 일은 사용자가 한다.
- 탑승동 끝단 12개 탑승구의 확정 목록과 구역별 시설 정보. 받으면 `db/seed-zones.json`만 고친다.

## spec과 달라진 구현 세부

- spec 3장은 예약 실행을 "Supabase pg_cron + Edge Function"으로 적었다. 이 계획은 pg_cron이 Next.js의 `/api/cron/*` 경로를 호출하게 한다. 수집·삭제 로직을 한 언어, 한 곳에 두고 같은 테스트로 검증하기 위해서다. 동작과 주기는 같다.

## 실행하면서 달라진 점 (2026-10-05)

- 경로 처리기의 본체를 `src/lib/api/{public,staff,desk}.ts` 에 두고 `src/app/api/**/route.ts` 는 그것을 부르기만 한다. 검사는 `tests/api.test.ts` 한 파일에 모았다.
- `/api/desk/*` 네 경로는 `src/app/api/desk/[action]/route.ts` 하나로 받는다.
- `scripts/print-passes.ts` 대신 안내데스크 화면 `/staff/desk/passes` 를 만들었다. 로컬 내장 DB 는 한 프로세스만 열 수 있어, 서버가 떠 있는 동안 스크립트로는 패스를 볼 수 없기 때문이다.
- 안내데스크의 연결·재발급이 QR 스캔 외에 고유 일련 번호 입력도 받는다(`idleTokenByPassNo`). 미사용 패스만 받는다.
- 수집 한 회를 `src/lib/flights/poll.ts` 의 `runPoll` 로 뺐다. 0건 응답은 실패로 기록한다.
- `ingestFlights` 는 응답에서 탑승구가 비어 와도 알고 있던 탑승구를 지우지 않는다.
- `CaseView.openEncounterId` 대신 `recordScan` 이 `{ id, started }` 를 돌려준다.
- 구역 seed 파일은 탑승구 목록 대신 `gateRanges` (시작·끝 묶음)로 적는다.
