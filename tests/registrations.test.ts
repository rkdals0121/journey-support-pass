import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { findFlights, getFlight, operatingFlight } from "@/lib/flights/search";
import { createRegistration, getRegistration, isUuid } from "@/lib/registrations";
import { createTestDb, kst } from "./helpers/db";
import { addFlights, CHOICES, flightRow, regInput, register } from "./helpers/fixtures";

const now = kst("2026-10-05 12:00");

// 이 파일의 검사는 운항 정보를 바꾸지 않는다. DB 하나를 함께 쓴다.
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await addFlights(
    db,
    [
      flightRow("KE123", "2026-10-05 14:30"),
      flightRow("KE123", "2026-10-06 14:30"),
      flightRow("KE001", "2026-10-05 09:00"),
      flightRow("KE777", "2026-10-05 11:30", { estAt: kst("2026-10-05 13:00") }),
      flightRow("KE888", "2026-10-05 12:30", { status: "출발" }),
      flightRow("KE123", "2026-10-07 14:30"),
      flightRow("KE555", "2026-10-05 12:00"),
      flightRow("KE556", "2026-10-05 12:01"),
      flightRow("CX900", "2026-10-05 16:00", { status: "결항" }),
      flightRow("TK091", "2026-10-05 23:20", { gate: 118, terminal: "T1" }),
      flightRow("OZ6931", "2026-10-05 23:20", { masterNo: "TK091", gate: null, terminal: "T1" }),
      flightRow("AA1", "2026-10-05 20:00", { masterNo: "ZZ9" }),
      // 공동운항. 실제 운항 편(OP)이 떠났거나 지연된 경우.
      flightRow("OP1", "2026-10-05 14:30", { status: "출발" }),
      flightRow("CS1", "2026-10-05 14:30", { masterNo: "OP1", gate: null }),
      flightRow("OP2", "2026-10-05 11:30", { estAt: kst("2026-10-05 13:00") }),
      flightRow("CS2", "2026-10-05 11:30", { masterNo: "OP2", gate: null }),
      flightRow("KE900", "2026-10-04 23:30"),
    ],
    now,
  );
});

const count = async () => (await db.query("select 1 from registrations")).length;

describe("편명 검색", () => {
  it("오늘과 내일 편을 예정 시각 순으로 돌려준다", async () => {
    const res = await findFlights(db, "ke 123", now);
    expect(res.map((f) => f.flightDate)).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("이미 떠난 편은 빼고, 지연되어 아직 안 떠난 편은 남긴다", async () => {
    expect(await findFlights(db, "KE001", now)).toHaveLength(0);
    expect(await findFlights(db, "KE888", now)).toHaveLength(0);
    expect(await findFlights(db, "KE777", now)).toHaveLength(1);
  });

  it("없는 편명과 이상한 입력은 빈 목록", async () => {
    expect(await findFlights(db, "ZZ999", now)).toHaveLength(0);
    expect(await findFlights(db, "", now)).toHaveLength(0);
    expect(await findFlights(db, "'; drop table flights; --", now)).toHaveLength(0);
  });

  it("공동운항은 실제 운항 편의 탑승구를 쓴다", async () => {
    const f = await getFlight(db, "2026-10-05", "OZ6931");
    expect(f?.gate).toBeNull();
    const op = await operatingFlight(db, f!);
    expect(op.flightNo).toBe("TK091");
    expect(op.gate).toBe(118);
  });

  it("운항 편이 테이블에 없으면 자기 자신", async () => {
    const f = await getFlight(db, "2026-10-05", "AA1");
    expect((await operatingFlight(db, f!)).flightNo).toBe("AA1");
  });
});

describe("등록", () => {
  it("항공편과 고른 항목만 받아 패스를 기다리는 상태로 만든다", async () => {
    const res = await createRegistration(db, regInput(), now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.registration).toEqual({
      id: res.registration.id,
      flightDate: "2026-10-05",
      flightNo: "KE123",
      choices: CHOICES,
      lang: "ko",
      route: "web",
      status: "pending",
      submittedAt: now,
    });
    expect(isUuid(res.registration.id)).toBe(true);
  });

  it("이름은 받지 않는다. 넣어 보내도 저장하지 않고, 예전 구조의 칸은 비워 둔다", async () => {
    const withName = { ...regInput(), name: "홍길동", categories: ["cat_senior"], receiptNo: "0427" };
    const res = await createRegistration(db, withName, now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.registration)).not.toContain("name");
    const [row] = await db.query<Record<string, unknown>>(
      "select name, receipt_no, categories, needs from registrations where id = $1",
      [res.registration.id],
    );
    expect(row).toEqual({ name: null, receipt_no: null, categories: [], needs: CHOICES });
    expect(JSON.stringify(await db.query("select * from registrations where id = $1", [res.registration.id]))).not.toContain(
      "홍길동",
    );
  });

  it("작성 시작 시각, 수정 횟수, 동의 시각, 모의 자료 표시를 남긴다", async () => {
    const reg = await register(db, now, { editCount: 2 });
    const [row] = await db.query<{ started_at: Date; edit_count: number; is_mock: boolean; consent_at: Date; submitted_at: Date }>(
      "select started_at, edit_count, is_mock, consent_at, submitted_at from registrations where id = $1",
      [reg.id],
    );
    expect(row).toEqual({
      started_at: kst("2026-10-05 11:58"),
      edit_count: 2,
      is_mock: true,
      consent_at: now,
      submitted_at: now,
    });
  });

  it("미래이거나 읽을 수 없는 시작 시각은 제출 시각으로 바꾼다", async () => {
    const startedOf = async (startedAt: Date) => {
      const reg = await register(db, now, { startedAt });
      const [row] = await db.query<{ started_at: Date }>("select started_at from registrations where id = $1", [reg.id]);
      return row.started_at;
    };
    expect(await startedOf(kst("2026-10-05 13:00"))).toEqual(now);
    expect(await startedOf(new Date(Number.NaN))).toEqual(now);
    expect(await startedOf("2026-10-05" as never)).toEqual(now);
    expect(await startedOf(now)).toEqual(now);
  });

  it("이상한 수정 횟수는 0 으로 둔다", async () => {
    const editsOf = async (editCount: number) => {
      const reg = await register(db, now, { editCount });
      const [row] = await db.query<{ edit_count: number }>("select edit_count from registrations where id = $1", [reg.id]);
      return row.edit_count;
    };
    expect(await editsOf(-1)).toBe(0);
    expect(await editsOf(1.5)).toBe(0);
    expect(await editsOf(Number.NaN)).toBe(0);
    expect(await editsOf(3)).toBe(3);
  });

  it("동의, 선택 항목, 편명, 경로를 검증한다. 거부한 것은 저장하지 않는다", async () => {
    const before = await count();
    const errorOf = async (over: Parameters<typeof regInput>[0]) => {
      const res = await createRegistration(db, regInput(over), now);
      return res.ok ? null : res.error;
    };
    expect(await errorOf({ consent: false })).toBe("동의가 필요합니다");
    expect(await errorOf({ consent: "true" as never })).toBe("동의가 필요합니다");
    expect(await errorOf({ choices: ["nope"] })).toBe("선택 항목이 맞지 않습니다");
    expect(await errorOf({ choices: ["cat_senior"] })).toBe("선택 항목이 맞지 않습니다");
    expect(await errorOf({ choices: ["gd_large", "gd_large"] })).not.toBeNull();
    expect(await errorOf({ choices: ["stf_call", "stf_self"] })).toContain("하나만");
    expect(await errorOf({ choices: "gd_large" as never })).not.toBeNull();
    expect(await errorOf({ flightNo: "ZZ999" })).toBe("편명을 다시 확인해 주세요");
    expect(await errorOf({ flightNo: "" })).toBe("편명을 다시 확인해 주세요");
    expect(await errorOf({ flightDate: "2026-10-08" })).toBe("편명을 다시 확인해 주세요");
    expect(await errorOf({ flightDate: "2026-10-07" })).toBe("오늘과 내일 출발하는 편만 등록할 수 있습니다");
    expect(await errorOf({ flightDate: "10/05" })).toBe("편명을 다시 확인해 주세요");
    expect(await errorOf({ route: "paper" as never })).toBe("등록 경로가 맞지 않습니다");
    expect(await errorOf({ route: "" as never })).toBe("등록 경로가 맞지 않습니다");
    expect(await count()).toBe(before);
  });

  it("아무것도 고르지 않아도 등록된다", async () => {
    const res = await createRegistration(db, regInput({ choices: [] }), now);
    expect(res.ok && res.registration.choices).toEqual([]);
  });

  it("경로는 휴대전화, 키오스크, 직원 대신 입력 세 가지다", async () => {
    for (const route of ["web", "kiosk", "assisted"] as const) {
      expect((await register(db, now, { route })).route, route).toBe(route);
    }
  });

  it("화면 언어를 남긴다. 영어가 아니면 한국어로 둔다", async () => {
    expect((await register(db, now, { lang: "en" })).lang).toBe("en");
    expect((await register(db, now, { lang: "ko" })).lang).toBe("ko");
    expect((await register(db, now, { lang: "fr" as never })).lang).toBe("ko");
  });

  it("편명은 띄어쓰기와 소문자를 고쳐서 저장한다", async () => {
    expect((await register(db, now, { flightNo: "ke 123" })).flightNo).toBe("KE123");
  });

  it("편명이 같아도 고른 날짜의 편으로 등록된다", async () => {
    expect((await register(db, now, { flightDate: "2026-10-06" })).flightDate).toBe("2026-10-06");
  });

  it("id 로 찾는다", async () => {
    const reg = await register(db, now);
    expect(await getRegistration(db, reg.id)).toEqual(reg);
    expect(await getRegistration(db, "not-a-uuid")).toBeNull();
    expect(await getRegistration(db, "00000000-0000-4000-8000-000000000009")).toBeNull();
  });
});

describe("이미 떠난 편", () => {
  const errorOf = async (flightNo: string, at: Date = now) => {
    const res = await createRegistration(db, regInput({ flightNo }), at);
    return res.ok ? null : res.error;
  };
  const DEPARTED = "이미 출발한 편입니다. 편명을 다시 확인해 주세요";

  it("출발 시각이 지난 편으로는 받지 않는다", async () => {
    expect(await errorOf("KE001")).toBe(DEPARTED);
  });

  it("상태가 출발이면 예정 시각이 남아 있어도 받지 않는다", async () => {
    expect(await errorOf("KE888")).toBe(DEPARTED);
  });

  it("지연되어 아직 떠나지 않은 편은 받는다. 바뀐 출발 시각이 지나면 받지 않는다", async () => {
    expect(await errorOf("KE777")).toBeNull();
    expect(await errorOf("KE777", kst("2026-10-05 12:59"))).toBeNull();
    expect(await errorOf("KE777", kst("2026-10-05 13:00"))).toBe(DEPARTED);
  });

  it("출발 시각과 같은 순간에는 받지 않고, 1분 전에는 받는다", async () => {
    expect(await errorOf("KE555")).toBe(DEPARTED);
    expect(await errorOf("KE556")).toBeNull();
  });

  it("결항 편은 받는다. 여객이 공항에 와 있을 수 있다", async () => {
    expect(await errorOf("CX900")).toBeNull();
  });

  it("공동운항은 실제 운항 편이 떠났으면 받지 않는다. 고른 편의 상태가 비어 있어도 같다", async () => {
    expect((await getFlight(db, "2026-10-05", "CS1"))?.status).toBe("");
    expect(await errorOf("CS1")).toBe(DEPARTED);
    expect(await errorOf("OP1")).toBe(DEPARTED);
  });

  it("공동운항은 실제 운항 편의 바뀐 출발 시각으로 본다", async () => {
    // 고른 편(CS2)에는 바뀐 시각이 없다. 실제 운항 편(OP2)이 13:00 으로 늦어졌다.
    expect((await getFlight(db, "2026-10-05", "CS2"))?.estAt).toBeNull();
    expect(await errorOf("CS2")).toBeNull();
    expect(await errorOf("CS2", kst("2026-10-05 12:59"))).toBeNull();
    expect(await errorOf("CS2", kst("2026-10-05 13:00"))).toBe(DEPARTED);
  });

  it("실제 운항 편이 운항 정보에 없으면 고른 편의 시각으로 본다", async () => {
    expect(await errorOf("AA1")).toBeNull();
    expect(await errorOf("AA1", kst("2026-10-05 20:00"))).toBe(DEPARTED);
  });
});

describe("등록할 수 있는 날짜", () => {
  const errorOf = async (flightDate: string, at: Date = now, flightNo = "KE123") => {
    const res = await createRegistration(db, regInput({ flightDate, flightNo }), at);
    return res.ok ? null : res.error;
  };
  const NOT_YET = "오늘과 내일 출발하는 편만 등록할 수 있습니다";

  it("오늘과 내일(한국 날짜) 편만 받는다. 모레 편은 운항 정보에 있어도 받지 않는다", async () => {
    const before = await count();
    expect(await errorOf("2026-10-05")).toBeNull();
    expect(await errorOf("2026-10-06")).toBeNull();
    expect(await errorOf("2026-10-07")).toBe(NOT_YET);
    expect(await count()).toBe(before + 2);
  });

  it("한국 시각으로 자정이 지나면 그날부터 하루 뒤 편까지 받는다", async () => {
    expect(await errorOf("2026-10-06", kst("2026-10-04 23:59"))).toBe(NOT_YET);
    expect(await errorOf("2026-10-06", kst("2026-10-05 00:00"))).toBeNull();
    expect(await errorOf("2026-10-07", kst("2026-10-05 23:59"))).toBe(NOT_YET);
    expect(await errorOf("2026-10-07", kst("2026-10-06 00:00"))).toBeNull();
  });

  it("어제 날짜의 편도 받지 않는다", async () => {
    expect(await errorOf("2026-10-04", now, "KE900")).toBe(NOT_YET);
    expect(await errorOf("2026-10-04", kst("2026-10-04 23:00"), "KE900")).toBeNull();
  });
});
