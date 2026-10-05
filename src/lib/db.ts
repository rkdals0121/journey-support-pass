import fs from "node:fs";
import path from "node:path";

// 브라우저 코드에서 가져오지 말 것. DB 접근은 서버에서만 한다.

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** 여러 문장을 한 번에 실행한다. 스키마 적용 전용. */
  exec(sql: string): Promise<void>;
}

const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

export async function migrate(db: Db): Promise<void> {
  await db.exec(fs.readFileSync(SCHEMA_PATH, "utf-8"));
}

/** dataDir 를 주지 않으면 메모리에만 둔다(테스트용). */
export async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pg.query(sql, params as never[]);
      return res.rows as T[];
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
  };
}

async function openPg(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 3 });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
  };
}

// 개발 서버가 파일을 다시 읽어도 연결을 하나만 유지한다.
const holder = globalThis as unknown as { __jspDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!holder.__jspDb) {
    const url = process.env.DATABASE_URL;
    holder.__jspDb = url
      ? openPg(url)
      : (async () => {
          const dir = path.join(process.cwd(), ".data", "pglite");
          fs.mkdirSync(dir, { recursive: true });
          const db = await openPglite(dir);
          await migrate(db);
          return db;
        })();
  }
  return holder.__jspDb;
}
