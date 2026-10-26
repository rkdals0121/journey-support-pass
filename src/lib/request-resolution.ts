import { businessOf } from "./operating-profile";

export const RESOLUTION_KINDS = [
  "advice",
  "referral",
  "handoff",
  "resolved",
] as const;
export type ResolutionKind = (typeof RESOLUTION_KINDS)[number];
export const RESOLUTION_LABEL: Record<ResolutionKind, string> = {
  advice: "상담·안내 완료",
  referral: "담당 창구 안내 완료",
  handoff: "담당 부서 인계 확인",
  resolved: "현장 조치 완료 확인",
};
export const RESOLUTION_EN: Record<ResolutionKind, string> = {
  advice: "Advice provided",
  referral: "Service contact provided",
  handoff: "Department handover confirmed by staff",
  resolved: "On-site resolution confirmed by staff",
};
export interface RequestResolution {
  kind: ResolutionKind;
  businessId: string | null;
  message: string;
}

// A department handover is a staff confirmation, never an automatic API acknowledgement.
export function parseResolution(value: unknown): RequestResolution | string {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "처리 결과를 입력해 주세요";
  const input = value as Record<string, unknown>;
  if (!RESOLUTION_KINDS.includes(input.kind as ResolutionKind))
    return "처리 결과 유형을 확인해 주세요";
  if (
    typeof input.message !== "string" ||
    !input.message.trim() ||
    input.message.trim().length > 240
  )
    return "여객에게 전달할 결과를 240자 이내로 적어 주세요";
  const business =
    input.businessId == null || input.businessId === ""
      ? null
      : businessOf(input.businessId);
  if (input.businessId != null && input.businessId !== "" && !business)
    return "담당 업무를 확인해 주세요";
  if (["referral", "handoff"].includes(input.kind as string) && !business)
    return "안내하거나 인계한 담당 업무를 골라 주세요";
  if (
    ["handoff", "resolved"].includes(input.kind as string) &&
    input.confirmed !== true
  )
    return "실제 인계 또는 현장 조치 여부를 확인해 주세요";
  return {
    kind: input.kind as ResolutionKind,
    businessId: business?.id ?? null,
    message: input.message.trim(),
  };
}
