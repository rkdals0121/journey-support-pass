import { describe, expect, it } from "vitest";
import { migrate, pgOptions } from "@/lib/db";
import { createTestDb } from "./helpers/db";

const insertPending = `
  insert into registrations (receipt_no, name, route, consent_at, started_at, submitted_at)
  values ($1, '홍길동', 'web', now(), now(), now()) returning id`;

describe("스키마", () => {
  it("테이블 7개를 만든다", async () => {
    const db = await createTestDb();
    const rows = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual([
      "access_logs",
      "encounters",
      "flight_polls",
      "flights",
      "passes",
      "registrations",
      "zones",
    ]);
  });

  it("두 번 적용해도 오류가 없다", async () => {
    const db = await createTestDb();
    await expect(migrate(db)).resolves.toBeUndefined();
  });

  it("접수 번호는 연결 대기 중인 건 안에서만 겹치지 않는다", async () => {
    const db = await createTestDb();
    const [first] = await db.query<{ id: string }>(insertPending, ["0427"]);
    await expect(db.query(insertPending, ["0427"])).rejects.toThrow();

    await db.query("update registrations set status = 'active' where id = $1", [first.id]);
    await expect(db.query(insertPending, ["0427"])).resolves.toHaveLength(1);
  });
});

describe("Postgres 연결 옵션", () => {
  it("sslmode 가 붙은 주소는 암호화 연결로 바꾸고 주소에서 뗀다", () => {
    const o = pgOptions("postgres://u:p@host:6543/postgres?sslmode=require&supa=base-pooler.x");
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
