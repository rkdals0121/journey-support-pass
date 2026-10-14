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
  urgentMin: 30, // 마감 n분 이내면 임박 (항공편 판을 빨갛게)

  purgeAfterDepartureMin: 30,
  purgeSafetyHours: 24,
  unlinkedPurgeHours: 24,
  logRetentionDays: 90,

  sessionHours: 12,
  kioskSessionDays: 30, // 키오스크는 한 번 설치하면 오래 켜 둔다
  lockMaxFails: 5, // 같은 기기에서
  lockIpMaxFails: 20, // 같은 접속 주소에서 (기기 표시를 바꿔 가며 시도하는 것을 막는다)
  lockMinutes: 10,
  // 키오스크에서 고유 일련 번호를 틀린 횟수. 공용 기기라 여러 여객의 실수가 쌓이므로 로그인보다 넉넉하게 둔다.
  // 여섯 자리 번호를 10분에 열 번 넣어서는 남의 패스를 맞히기 어렵다.
  numberLockMaxFails: 10,
  // 고유 일련 번호를 같은 접속 주소에서 틀린 횟수의 한도. 공항의 키오스크들은 한 접속 주소로 나가는 일이 많아
  // 로그인 한도(20)를 그대로 쓰면 여러 키오스크의 오타가 합쳐져 모든 키오스크의 번호 입력이 함께 잠긴다.
  // 번호를 넣으려면 설치 코드로 들어온 기기여야 하므로 조금 넉넉하게 둔다.
  numberLockIpMaxFails: 40,
  registerMaxPerIp: 20, // 같은 접속 주소에서 registerWindowMin 분 동안 받을 등록 수
  registerWindowMin: 10,
  registerMaxAll: 300, // 모든 접속 주소를 합해 registerWindowMin 분 동안 받을 휴대전화 등록 수

  callRefreshSec: 5, // 직원 화면이 호출 목록을 다시 읽는 간격
  guideRefreshSec: 30, // 안내 화면이 탑승구와 남은 시간을 다시 읽는 간격
  idleAskSec: 90, // 키오스크를 이만큼 건드리지 않으면 계속 쓸지 묻는다
  idleAnswerSec: 30, // 물은 뒤 이만큼 답이 없으면 처음 화면으로 돌아간다
  // 지금 걸려 있는 운항 수집 간격(분). vercel.json 의 예약과 맞춘다. 5분 간격으로 줄이면 여기도 5 로 바꾼다.
  pollMin: 60,
  // 수집이 멈춘 것으로 볼 시간. 이보다 오래되면 화면에 전광판을 확인하라고 경고한다.
  // Vercel 무료 요금제의 예약은 정해진 분이 아니라 그 시간대 안의 아무 때나 돈다. 그래서 정상일 때도
  // 두 수집 사이가 간격의 두 배 가까이(한 시간 간격이면 2시간 가까이) 벌어질 수 있다. 정상 간격으로는 경고하지 않게 두 배에 15분을 더한다.
  get staleMin() {
    return this.pollMin * 2 + 15;
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
