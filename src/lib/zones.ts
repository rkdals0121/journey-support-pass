import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db";

export interface Facilities {
  elevators: string[];
  restrooms: string[];
  waitingPoints: string[];
}

export interface Zone {
  id: string;
  terminal: string;
  label: string;
  band: string | null; // 중앙부 / 중간 / 끝단 (탑승동만)
  gates: number[];
  facilities: Facilities;
  isDesk: boolean;
}

interface ZoneRow {
  id: string;
  terminal: string;
  label: string;
  band: string | null;
  gates: number[];
  facilities: Facilities;
  is_desk: boolean;
}

const COLUMNS = "id, terminal, label, band, gates, facilities, is_desk";

function toZone(r: ZoneRow): Zone {
  return {
    id: r.id,
    terminal: r.terminal,
    label: r.label,
    band: r.band,
    gates: r.gates,
    facilities: {
      elevators: r.facilities?.elevators ?? [],
      restrooms: r.facilities?.restrooms ?? [],
      waitingPoints: r.facilities?.waitingPoints ?? [],
    },
    isDesk: r.is_desk,
  };
}

export async function getZone(db: Db, id: string): Promise<Zone | null> {
  const [row] = await db.query<ZoneRow>(`select ${COLUMNS} from zones where id = $1 and active`, [id]);
  return row ? toZone(row) : null;
}

/** 탑승구가 속한 구역. 꺼 둔 구역은 찾지 않는다. */
export async function zoneForGate(db: Db, terminal: string, gate: number): Promise<Zone | null> {
  const [row] = await db.query<ZoneRow>(
    `select ${COLUMNS} from zones where active and not is_desk and terminal = $1 and $2 = any(gates) limit 1`,
    [terminal, gate],
  );
  return row ? toZone(row) : null;
}

export interface SeedZone {
  id: string;
  terminal: string;
  label: string;
  band: string | null;
  gateRanges: [number, number][];
  code: string;
  isDesk: boolean;
  active: boolean;
  facilities: Facilities;
}

export function expandGates(ranges: [number, number][]): number[] {
  const gates: number[] = [];
  for (const [from, to] of ranges) for (let g = from; g <= to; g++) gates.push(g);
  return gates;
}

const CODES_FILE = "zone-codes.local.json";

/**
 * 저장소에 올리지 않는 배포용 접속 코드 ({ "구역 id": "코드" }). 없으면 null.
 * seed-zones.json 의 코드는 저장소에 공개된 값이라 배포 DB 에는 넣지 않는다.
 */
export function readLocalCodes(): Record<string, string> | null {
  const file = path.join(process.cwd(), "db", CODES_FILE);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : null;
}

export function applyCodeOverrides(zones: SeedZone[], codes: Record<string, string>): SeedZone[] {
  return zones.map((z) => (typeof codes[z.id] === "string" && codes[z.id] ? { ...z, code: codes[z.id] } : z));
}

export function readSeedZones(): SeedZone[] {
  const file = path.join(process.cwd(), "db", "seed-zones.json");
  return JSON.parse(fs.readFileSync(file, "utf-8")).zones;
}

/** db/seed-zones.json 을 적재한다. 접속 코드는 해시로 바꿔 저장한다. codes 를 주면 그 구역의 코드를 바꿔 넣는다. */
export async function seedZones(
  db: Db,
  hash: (code: string) => string,
  codes: Record<string, string> = {},
): Promise<number> {
  const zones = applyCodeOverrides(readSeedZones(), codes);
  for (const z of zones) {
    await db.query(
      `insert into zones (id, terminal, label, band, gates, facilities, code_hash, is_desk, active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (id) do update set
         terminal = excluded.terminal, label = excluded.label, band = excluded.band,
         gates = excluded.gates, facilities = excluded.facilities, code_hash = excluded.code_hash,
         is_desk = excluded.is_desk, active = excluded.active`,
      [
        z.id,
        z.terminal,
        z.label,
        z.band,
        expandGates(z.gateRanges),
        JSON.stringify(z.facilities),
        hash(z.code),
        z.isDesk,
        z.active,
      ],
    );
  }
  return zones.length;
}
