import { BUSINESS_AREAS } from "./operating-profile";
import type { ResolutionKind } from "./request-resolution";
export const UNCLASSIFIED_BUSINESS = "unclassified";
export interface BusinessLoad {
  businessId: string;
  label: string;
  group: string;
  todayIntake: number;
  active: number;
  waiting: number;
  attention: number;
  oldestWaitingSec: number | null;
}
export interface BusinessOverview {
  asOf: string;
  date: string;
  totals: Omit<BusinessLoad, "businessId" | "label" | "group"> & {
    todayLinked: number;
    todayCompleted: number;
    todayOtherClosed: number;
    medianAcceptSec: number | null;
    medianCompletionSec: number | null;
  };
  businesses: BusinessLoad[];
  results: Record<ResolutionKind | "unrecorded", number>;
}
export function businessFilterLabel(id: string) {
  return id === UNCLASSIFIED_BUSINESS
    ? "미분류·이전 요청"
    : BUSINESS_AREAS.find((b) => b.id === id)?.label;
}
export function overviewQueueLink(businessId?: string, scope = "active") {
  const q = new URLSearchParams({ scope });
  if (businessId) q.set("business", businessId);
  return "/staff/requests?" + q.toString();
}
