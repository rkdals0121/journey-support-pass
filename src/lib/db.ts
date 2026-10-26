import fs from "node:fs";
import path from "node:path";

// 브라우저 코드에서 가져오지 말 것. DB 접근은 서버에서만 한다.

export interface Db {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** 여러 문장을 한 트랜잭션으로 실행한다. 스키마 적용 전용. */
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
      await pg.transaction(async (transaction) => {
        await transaction.exec(sql);
      });
    },
  };
}

/**
 * Supabase 연결 주소에는 sslmode=require 가 붙어 온다. 드라이버는 이를 인증서 검증까지 하는 것으로 읽는데,
 * Supabase 의 인증서는 Node 기본 신뢰 목록에 없는 자체 인증 기관이 서명한 것이라 연결이 거부된다.
 * 그래서 주소에서 sslmode 를 떼고, 암호화는 하되 인증서 검증은 하지 않게 한다.
 * 실제 여객 정보를 받기 전에 Supabase 인증 기관 인증서를 넣어 검증을 켤 것 (README 참고).
 */
export function pgOptions(url: string): {
  connectionString: string;
  ssl?: { rejectUnauthorized: false };
} {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  if (!mode || mode === "disable") return { connectionString: url };
  u.searchParams.delete("sslmode");
  return { connectionString: u.toString(), ssl: { rejectUnauthorized: false } };
}

async function openPg(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({ ...pgOptions(url), max: 3 });
  // 유휴 연결이 끊겨도 서버가 죽지 않게 한다. 다음 질의에서 새 연결을 맺는다.
  pool.on("error", (e) => console.error("DB 연결 오류:", e.message));
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },
    async exec(sql: string) {
      const client = await pool.connect();
      let destroy = false;
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          destroy = true;
        }
        throw error;
      } finally {
        client.release(destroy);
      }
    },
  };
}

// 개발 서버가 파일을 다시 읽어도 연결을 하나만 유지한다.
const holder = globalThis as unknown as { __jspDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!holder.__jspDb) {
    // Vercel 의 Postgres 연동은 POSTGRES_URL 이름으로 넣어 준다.
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    // 배포 환경의 파일 시스템은 요청마다 사라진다. 내장 DB 로 조용히 넘어가면 등록이 저장되지 않는다.
    if (!url && process.env.VERCEL)
      throw new Error("DATABASE_URL 이 설정되지 않았습니다");
    holder.__jspDb = url
      ? openPg(url)
      : (async () => {
          const dir =
            process.env.JSP_LOCAL_DB_DIR ||
            path.join(process.cwd(), ".data", "pglite");
          fs.mkdirSync(dir, { recursive: true });
          const db = await openPglite(dir);
          await migrate(db);
          return db;
        })();
  }
  return holder.__jspDb;
}
