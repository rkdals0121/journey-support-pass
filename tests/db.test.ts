import { beforeAll, describe, expect, it } from "vitest";
import { migrate, pgOptions, type Db } from "@/lib/db";
import { createTestDb } from "./helpers/db";

const insertRegistration = `
  insert into registrations (route, consent_at, started_at, submitted_at)
  values ($1, now(), now(), now()) returning id`;

describe("스키마", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("기존 표와 시험 연동 대기열을 포함한 25개 표를 만든다", async () => {
    const rows = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type='BASE TABLE'",
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual([
      "access_logs",
      "active_service_claims",
      "assist_requests",
      "calls",
      "dispatch_resources",
      "events",
      "flight_polls",
      "flights",
      "integration_jobs",
      "passes",
      "registrations",
      "request_alert_deliveries",
      "request_alerts",
      "request_push_subscriptions",
      "service_request_history",
      "service_request_limits",
      "service_requests",
      "support_crew",
      "support_experience_events",
      "support_hub_rules",
      "support_resource_holds",
      "support_studies",
      "support_visit_history",
      "support_visits",
      "zones",
    ]);
  });

  it("두 번 적용해도 오류가 없다", async () => {
    await expect(migrate(db)).resolves.toBeUndefined();
    await expect(migrate(db)).resolves.toBeUndefined();
  });
  it("스키마 묶음이 실패하면 앞선 변경도 되돌리고 다음 질의를 실행할 수 있다", async () => {
    await expect(
      db.exec(
        "create table migration_rollback_probe(id int); select missing_column from zones",
      ),
    ).rejects.toThrow();
    expect(
      await db.query(
        "select table_name from information_schema.tables where table_name='migration_rollback_probe'",
      ),
    ).toHaveLength(0);
    expect(await db.query("select 1 as alive")).toEqual([{ alive: 1 }]);
    await expect(migrate(db)).resolves.toBeUndefined();
  });

  it("구역에는 키오스크 자리 표시가, 등록에는 화면 언어가 있다", async () => {
    const cols = await db.query<{
      table_name: string;
      column_name: string;
      column_default: string | null;
    }>(
      `select table_name, column_name, column_default from information_schema.columns
       where (table_name = 'zones' and column_name = 'is_kiosk') or (table_name = 'registrations' and column_name = 'lang')`,
    );
    expect(cols.find((c) => c.table_name === "zones")?.column_default).toBe(
      "false",
    );
    expect(
      cols.find((c) => c.table_name === "registrations")?.column_default,
    ).toContain("ko");
  });

  it("등록 경로는 web, kiosk, assisted 와 예전의 paper 만 받는다", async () => {
    for (const route of ["web", "kiosk", "assisted", "paper"]) {
      await expect(
        db.query(insertRegistration, [route]),
        route,
      ).resolves.toHaveLength(1);
    }
    await expect(db.query(insertRegistration, ["phone"])).rejects.toThrow();
    await expect(db.query(insertRegistration, [""])).rejects.toThrow();
  });

  it("이름 없이 등록 행을 만들 수 있다. 이름 칸은 비어 있다", async () => {
    const [{ id }] = await db.query<{ id: string }>(insertRegistration, [
      "web",
    ]);
    const [row] = await db.query(
      "select name, receipt_no, lang, status, needs from registrations where id = $1",
      [id],
    );
    expect(row).toEqual({
      name: null,
      receipt_no: null,
      lang: "ko",
      status: "pending",
      needs: [],
    });
  });

  it("한 등록에 사용 중인 패스는 한 장뿐이다. 끝난 패스는 여러 장 있어도 된다", async () => {
    const [{ id }] = await db.query<{ id: string }>(insertRegistration, [
      "web",
    ]);
    const insert =
      "insert into passes (token, pass_no, registration_id, state) values ($1, $2, $3, $4)";
    await db.query(insert, ["A".repeat(16), "100001", id, "active"]);
    await expect(
      db.query(insert, ["B".repeat(16), "100002", id, "active"]),
    ).rejects.toThrow();
    await expect(
      db.query(insert, ["C".repeat(16), "100003", id, "revoked"]),
    ).resolves.toBeDefined();
    await expect(
      db.query(insert, ["D".repeat(16), "100004", id, "expired"]),
    ).resolves.toBeDefined();
  });

  it("고유 일련 번호는 살아 있는 패스 안에서만 겹치지 않는다. QR 값은 언제나 겹치지 않는다", async () => {
    const insert =
      "insert into passes (token, pass_no, state) values ($1, $2, $3)";
    await db.query(insert, ["E".repeat(16), "200001", "active"]);
    await expect(
      db.query(insert, ["F".repeat(16), "200001", "active"]),
    ).rejects.toThrow();
    await expect(
      db.query(insert, ["F".repeat(16), "200001", "expired"]),
    ).resolves.toBeDefined();
    await expect(
      db.query(insert, ["E".repeat(16), "200002", "expired"]),
    ).rejects.toThrow();
    await expect(
      db.query(insert, ["G".repeat(16), "200003", "lost"]),
    ).rejects.toThrow();
  });

  it("한 키오스크에서 끝나지 않은 호출은 하나뿐이다. 끝난 호출은 여러 개 있어도 된다", async () => {
    const open =
      "insert into calls (created_at, place_id, zone_id) values (now(), $1, 'cc-mid')";
    const ended =
      "insert into calls (created_at, place_id, zone_id, ended_at, end_kind) values (now(), $1, 'cc-mid', now(), $2)";
    await db.query(open, ["cc-108"]);
    await expect(db.query(open, ["cc-108"])).rejects.toThrow();
    await expect(db.query(open, ["cc-125"])).resolves.toBeDefined();
    await expect(db.query(ended, ["cc-108", "done"])).resolves.toBeDefined();
    await expect(
      db.query(ended, ["cc-108", "cancelled"]),
    ).resolves.toBeDefined();
    await expect(db.query(ended, ["cc-108", "lost"])).rejects.toThrow();
  });

  it("건수 기록은 정해진 네 종류만 받는다", async () => {
    const insert = "insert into events (at, kind) values (now(), $1)";
    for (const kind of ["reg_start", "reg_done", "guide_open", "survey"]) {
      await expect(db.query(insert, [kind]), kind).resolves.toBeDefined();
    }
    await expect(db.query(insert, ["page_view"])).rejects.toThrow();
  });

  it("건수 기록과 호출에는 이름이나 편명을 담을 칸이 없다", async () => {
    const cols = await db.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_name in ('events', 'calls')",
    );
    const names = cols.map((c) => c.column_name);
    expect(names).not.toContain("name");
    expect(names).not.toContain("flight_no");
    expect(
      cols
        .filter((c) => c.table_name === "events")
        .map((c) => c.column_name)
        .sort(),
    ).toEqual(
      [
        "adapted",
        "at",
        "device_key",
        "id",
        "kind",
        "place_id",
        "route",
        "value",
      ].sort(),
    );
  });
});

describe("Postgres 연결 옵션", () => {
  it("sslmode 가 붙은 주소는 암호화 연결로 바꾸고 주소에서 뗀다", () => {
    const o = pgOptions(
      "postgres://u:p@host:6543/postgres?sslmode=require&supa=base-pooler.x",
    );
    expect(o.ssl).toEqual({ rejectUnauthorized: false });
    expect(o.connectionString).not.toContain("sslmode");
    expect(o.connectionString).toContain("supa=base-pooler.x");
    expect(o.connectionString).toContain("host:6543");
  });

  it("sslmode 가 없으면 그대로 둔다", () => {
    expect(pgOptions("postgres://u:p@localhost:5432/db")).toEqual({
      connectionString: "postgres://u:p@localhost:5432/db",
    });
  });
});
