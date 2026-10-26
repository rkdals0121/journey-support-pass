/** Our sandbox bridge contract, not a vendor/airport API claim. */
export const INTEGRATION_CHANNELS = ["agency", "robot", "mobility"] as const;
export type IntegrationChannel = (typeof INTEGRATION_CHANNELS)[number];
export const CHANNEL_LABEL = {
  agency: "기관 접수 시스템",
  robot: "안내로봇",
  mobility: "이동지원 장비",
};
export interface IntegrationReadiness {
  channel: IntegrationChannel;
  state: "not_configured" | "sandbox" | "blocked";
  message: string;
}
export const JOB_LABEL: Record<string, string> = {
  pending: "전송 대기",
  sending: "전송 확인 중",
  acknowledged: "시험 서버 접수",
  in_progress: "시험 처리 중",
  completed: "시험 처리 완료",
  failed: "전송 실패",
  stopped: "전송 중단",
};
export interface IntegrationJobView {
  id: string;
  requestId: string;
  channel: IntegrationChannel;
  state: string;
  externalId: string | null;
  attempts: number;
  lastError: string;
  updatedAt: string;
  version: number;
}
