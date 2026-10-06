/**
 * 이 컴퓨터에서 띄운 개발 서버(http://localhost:3000)에 시연용 여객을 넣는다.
 * 모의 운항(npm run seed -- --mock-flights)이 들어 있어야 한다. 배포된 곳에는 쓰지 않는다.
 *
 *   npx tsx scripts/demo-passengers.ts
 *
 * 안내데스크 권한으로 로그인해 대신 등록하고, 가장 앞 번호 패스를 자동 배정한다.
 * 마지막 두 명은 패스를 연결하지 않고 남겨 "패스를 기다리는 등록"에 보이게 한다.
 */
import { readSeedZones } from "../src/lib/zones";

const BASE = "http://localhost:3000";

const PASSENGERS: { name: string; flightNo: string; categories: string[]; needs: string[]; link: boolean }[] = [
  { name: "김영희", flightNo: "MK101", categories: ["cat_senior"], needs: ["mov_need_rest", "com_slow"], link: true },
  {
    name: "박민수",
    flightNo: "MK102",
    categories: ["cat_disability"],
    needs: ["mov_wheelchair_own", "mov_no_stairs", "com_hearing", "com_written", "acc_companion"],
    link: true,
  },
  { name: "이정자", flightNo: "MK401", categories: ["cat_senior", "cat_disability"], needs: ["com_vision", "mov_escort"], link: true },
  { name: "최서연", flightNo: "MK111", categories: ["cat_pregnant"], needs: ["mov_no_standing"], link: true },
  { name: "정하준", flightNo: "MK221", categories: ["cat_infant"], needs: ["acc_stroller", "acc_companion"], link: true },
  { name: "한미숙", flightNo: "MK250", categories: ["cat_senior"], needs: ["com_wayfinding", "env_quiet"], link: true },
  { name: "오대기", flightNo: "MK900", categories: ["cat_disability"], needs: ["mov_wheelchair_need"], link: true },
  { name: "윤공동", flightNo: "MC830", categories: ["cat_child"], needs: ["acc_companion"], link: true },
  { name: "강도쿄", flightNo: "MK501", categories: ["cat_senior"], needs: ["mov_no_stairs"], link: true },
  { name: "서연결", flightNo: "MK112", categories: ["cat_senior"], needs: ["com_slow"], link: false },
  { name: "문접수", flightNo: "MK221", categories: ["cat_disability"], needs: ["mov_wheelchair_own"], link: false },
];

(async () => {
  const deskCode = readSeedZones().find((z) => z.isDesk)?.code;
  const login = await fetch(`${BASE}/api/staff/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: deskCode }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!login.ok || !cookie) throw new Error(`로그인 실패 ${login.status}`);
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  for (const p of PASSENGERS) {
    const found = await fetch(`${BASE}/api/flights/search?q=${p.flightNo}`).then((r) => r.json());
    const flight = (found.flights as { flightDate: string; flightNo: string }[]).find((f) => f.flightNo === p.flightNo);
    if (!flight) {
      console.log(`${p.name}: ${p.flightNo} 편을 찾지 못함 (모의 운항을 먼저 넣으세요)`);
      continue;
    }
    const body = {
      name: p.name,
      flightDate: flight.flightDate,
      flightNo: flight.flightNo,
      categories: p.categories,
      needs: p.needs,
      consent: true,
      startedAt: new Date(Date.now() - 90_000).toISOString(),
      editCount: 0,
    };
    if (!p.link) {
      // 여객이 직접 등록한 것처럼 넣는다. 접수 번호가 생긴다.
      const res = await fetch(`${BASE}/api/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      console.log(`${p.name}: 등록만 (접수 번호 ${((await res.json()) as { receiptNo?: string }).receiptNo})`);
      continue;
    }
    const reg = await post("/api/desk/register", { ...body, route: "assisted" });
    if (reg.status !== 200) {
      console.log(`${p.name}: 등록 실패 ${JSON.stringify(reg.body)}`);
      continue;
    }
    const link = await post("/api/desk/link", { registrationId: reg.body.registrationId, auto: true });
    console.log(`${p.name}: ${p.flightNo} 패스 ${link.body.passNo ?? JSON.stringify(link.body)}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
