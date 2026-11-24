import { readSeedZones } from "./zones";

// 시연 때 설치 코드·직원 접속 코드를 단추 하나로 넣게 하는 값. 화면 묶음(JS)에 코드를 박지 않고 서버가 db/seed-zones.json 에서 읽어 넘긴다.
// 이 단추가 켜져 있으면 화면을 여는 누구나 시연 코드를 알 수 있다. 시연이 아닌 곳에서는 DEMO_CODE_FILL=0 으로 끈다(기본은 켜짐).
// seed-zones.json 의 코드는 로컬 시연용 공개 값이다. 배포 DB 가 다른 코드(db/zone-codes.local.json)로 설정돼 있으면 이 값으로는 들어가지 못한다.
export interface DemoCodes {
  kiosk: string | null;
  staff: string | null;
}

export function demoCodeFillOn(): boolean {
  return process.env.DEMO_CODE_FILL !== "0";
}

export function demoCodes(): DemoCodes {
  const none = { kiosk: null, staff: null };
  if (!demoCodeFillOn()) return none;
  try {
    const zones = readSeedZones().filter((z) => z.active);
    return {
      kiosk: zones.find((z) => z.isKiosk)?.code ?? null,
      staff: zones.find((z) => z.isDesk)?.code ?? null,
    };
  } catch {
    // 파일을 못 읽어도 화면은 열려야 한다. 단추만 숨긴다.
    return none;
  }
}
