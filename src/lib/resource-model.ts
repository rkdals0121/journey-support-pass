export type ResourceKind = "robot" | "mobility";
export type ResourceStatus = "ready" | "maintenance" | "offline";
export interface DispatchResource {
  id: string;
  label: string;
  kind: ResourceKind;
  zoneId: string;
  zone: string;
  status: ResourceStatus;
  version: number;
  requestId: string | null;
  hubId?: string | null;
  availableAfter?: string | null;
}
export const RESOURCE_KIND = { robot: "안내로봇", mobility: "이동지원 장비" };
export const RESOURCE_STATUS = {
  ready: "가용",
  maintenance: "점검 중",
  offline: "운영 중지",
};
