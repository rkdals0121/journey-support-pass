import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, kst } from "./helpers/db";
import { deskSession, kioskSession, sessionOf } from "./helpers/fixtures";
import { recordStudy, studySummary } from "@/lib/support-study";
import type { Db } from "@/lib/db";
let db: Db;
const now=kst("2026-10-28 10:00");
const sample={channel:"web",task:"guidance",seconds:80,relays:0,repeated:1,completed:true};
beforeAll(async()=>{db=await createTestDb();});
describe("measured before-after comparison",()=>{
  it("accepts measurements only from the desk",async()=>{for(const s of [null,kioskSession(now, "kiosk-entry"),sessionOf(now)]) expect((await recordStudy(db,s,sample,now)).status).toBe(403);});
  it("rejects unbounded or incomplete samples",async()=>{for(const over of [{seconds:0},{relays:-1},{channel:"guess"},{completed:"yes"}]) expect((await recordStudy(db,deskSession(now),{...sample,...over},now)).status).toBe(400);});
  it("keeps methods separate and computes measured medians",async()=>{for(const seconds of [80,120,100]) expect((await recordStudy(db,deskSession(now),{...sample,seconds},now)).status).toBe(200);await recordStudy(db,deskSession(now),{...sample,channel:"phone",seconds:300,relays:2},now);const rows=await studySummary(db);expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({channel:"web",n:3,seconds:100}),expect.objectContaining({channel:"phone",n:1,seconds:300,relays:2})]));});
});
