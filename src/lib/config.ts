// 설정값은 여기 한 곳에만 둔다. 숫자는 기업탐방에서 기관 기준을 확인한 뒤 바꾼다.

const DEV_SECRET = "dev-only-secret-change-me";

function secret(name: string): string {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} 환경 변수가 필요합니다`);
  }
  return DEV_SECRET;
}

export const config = {
  // live 는 기관 개인정보 검토가 끝난 뒤에만 쓴다.
  dataMode: (process.env.DATA_MODE === "live" ? "live" : "mock") as "mock" | "live",

  boardingCloseMin: 10, // 탑승 마감 추정 = 출발 n분 전
  urgentMin: 30, // 마감 n분 이내면 임박
  staleMin: 15, // 운항 수집이 n분 넘게 실패하면 경고

  purgeAfterDepartureMin: 30,
  purgeSafetyHours: 24,
  unlinkedPurgeHours: 24,
  logRetentionDays: 90,

  sessionHours: 12,
  lockMaxFails: 5, // 같은 기기에서
  lockIpMaxFails: 20, // 같은 접속 주소에서 (기기 표시를 바꿔 가며 시도하는 것을 막는다)
  lockMinutes: 10,
  registerMaxPerIp: 20, // 같은 접속 주소에서 registerWindowMin 분 동안 받을 등록 수
  registerWindowMin: 10,

  cardTimeoutSec: 120,
  listRefreshSec: 30,
  pollMin: 5,

  get sessionSecret() {
    return secret("SESSION_SECRET");
  },
  get cronSecret() {
    return secret("CRON_SECRET");
  },
  get icnApiKey() {
    return process.env.ICN_API_KEY ?? "";
  },
  get baseUrl() {
    return process.env.BASE_URL ?? "http://localhost:3000";
  },
};
