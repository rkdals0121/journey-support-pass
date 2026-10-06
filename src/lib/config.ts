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
  agedMin: 15, // 운항 정보가 n분보다 오래되면 전광판을 한 번 더 보라고 안내

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
  // 지금 걸려 있는 운항 수집 간격(분). vercel.json 의 예약과 맞춘다. 5분 간격으로 줄이면 여기도 5 로 바꾼다.
  pollMin: 60,
  // 수집이 한 번 빠진 것으로 볼 시간. 이보다 오래되면 수집이 멈춘 것으로 보고 경고한다.
  get staleMin() {
    return this.pollMin + 15;
  },

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
