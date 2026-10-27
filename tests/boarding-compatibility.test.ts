import { beforeAll, beforeEach, expect, it } from "vitest";
import fs from "node:fs";
import sharp from "sharp";
import { prepareZXingModule } from "zxing-wasm/reader";
import { decodeBarcode } from "@/lib/barcode-reader";
import { readBoardingPayload } from "@/lib/airline-boarding";
import { isBoardingScan } from "@/lib/pass-format";
import { linkExistingBoarding } from "@/lib/boarding-link";
import { lookupPass } from "@/lib/api/public";
import { entryScanHandler } from "@/lib/api/entry";
import { createTestDb, kst } from "./helpers/db";
import {
  addFlights,
  flightRow,
  kioskSession,
  registerWithPass,
  resetData,
} from "./helpers/fixtures";
import { seedZones } from "@/lib/zones";
import type { Db } from "@/lib/db";
const now = kst("2026-10-27 12:00"),
  payload = "BP1:20261028:DX9001:D3M0123456";
let db: Db;
beforeAll(async () => {
  const wasm = new URL(
    "../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
    import.meta.url,
  );
  await prepareZXingModule({
    overrides: { wasmBinary: Uint8Array.from(fs.readFileSync(wasm)).buffer },
    fireImmediately: true,
  });
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await resetData(db);
  await addFlights(db, [flightRow("DX9001", "2026-10-28 18:00")], now);
});
it("decodes the actual mobile QR and rotated paper PDF417 artwork into the same boarding identity", async () => {
  for (const name of ["mobile-demo.png", "paper-demo.png"]) {
    const { data, info } = await sharp(
      fs.readFileSync(new URL("./fixtures/boarding/" + name, import.meta.url)),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const decoded = await decodeBarcode({
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
    } as ImageData);
    expect(decoded).toBe(payload);
  }
});
function bcbp(day = "301", carrier = "DX ", number = "09001") {
  return (
    "M1" +
    "KIM/DEMO".padEnd(20) +
    "E" +
    "DEMO01 " +
    "ICN" +
    "NRT" +
    carrier +
    number +
    day +
    "Y" +
    "012A" +
    "00001" +
    "1" +
    "00"
  );
}
it("reads a single-leg BCBP without retaining name or PNR and normalizes padded flight numbers", () => {
  expect(isBoardingScan(payload)).toBe(true);
  expect(isBoardingScan(bcbp())).toBe(true);
  expect(isBoardingScan("DEMO01")).toBe(false);
  const p = readBoardingPayload(bcbp(), now);
  expect(p).toMatchObject({ flightDate: "2026-10-28", flightNo: "DX9001" });
  expect(p?.ref).toMatch(/^[A-F0-9]{32}$/);
  expect(JSON.stringify(p)).not.toMatch(/KIM|DEMO01/);
  expect(readBoardingPayload(bcbp(), now)).toEqual(p);
  expect(readBoardingPayload(bcbp().replace("M1", "M2"), now)).toBeNull();
  expect(readBoardingPayload(bcbp("000"), now)).toBeNull();
  expect(readBoardingPayload(bcbp("999"), now)).toBeNull();
  expect(readBoardingPayload(bcbp().slice(0, 59), now)).toBeNull();
});
it("links the existing code without issuing a new pass and opens it on a kiosk", async () => {
  const { pass } = await registerWithPass(db, now, {
    flightDate: "2026-10-28",
    flightNo: "DX9001",
  });
  expect((await lookupPass(db, payload, now)).kind).toBe("none");
  expect(
    (
      await linkExistingBoarding(
        db,
        { token: pass.token, scanned: payload },
        now,
      )
    ).status,
  ).toBe(200);
  expect(
    (await linkExistingBoarding(db, { token: payload, scanned: payload }, now))
      .status,
  ).toBe(401);
  expect(
    (
      await linkExistingBoarding(
        db,
        { token: pass.token, scanned: payload },
        now,
      )
    ).status,
  ).toBe(200);
  expect(await db.query("select token from passes")).toEqual([
    { token: pass.token },
  ]);
  expect(
    (
      await entryScanHandler(
        db,
        kioskSession(now, "t1-info"),
        { scanned: payload },
        "scanner",
        now,
      )
    ).body.registered,
  ).toBe(true);
  expect(
    (await lookupPass(db, payload.replace("DX9001", "DX9002"), now)).kind,
  ).toBe("none");
});
it("rejects flight/date mismatches and refuses takeover by a different registration", async () => {
  const first = await registerWithPass(db, now, {
    flightDate: "2026-10-28",
    flightNo: "DX9001",
  });
  expect(
    (
      await linkExistingBoarding(
        db,
        {
          token: first.pass.token,
          scanned: payload.replace("20261028", "20261029"),
        },
        now,
      )
    ).status,
  ).toBe(400);
  await linkExistingBoarding(
    db,
    { token: first.pass.token, scanned: payload },
    now,
  );
  const second = await registerWithPass(db, now, {
    flightDate: "2026-10-28",
    flightNo: "DX9001",
  });
  expect(
    (
      await linkExistingBoarding(
        db,
        { token: second.pass.token, scanned: payload },
        now,
      )
    ).status,
  ).toBe(409);
  const result = await lookupPass(db, payload, now);
  expect(result.kind === "ok" && result.token).toBe(first.pass.token);
});
it("links an existing BCBP and resolves the same raw code through staff lookup", async () => {
  const { pass } = await registerWithPass(db, now, {
    flightDate: "2026-10-28",
    flightNo: "DX9001",
  });
  expect(
    (
      await linkExistingBoarding(
        db,
        { token: pass.token, scanned: bcbp() },
        now,
      )
    ).status,
  ).toBe(200);
  expect((await lookupPass(db, bcbp(), now)).kind).toBe("ok");
});
