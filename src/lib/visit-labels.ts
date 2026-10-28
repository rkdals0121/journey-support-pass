import type { VisitState } from "./service-hubs";
export const VISIT_STATE_EN: Record<VisitState, string> = {
  booked: "Appointment confirmed",
  checked_in: "Arrival confirmed",
  responding: "Robot guidance",
  handed_over: "Staff assistance",
  done: "Completed",
  cancelled: "Cancelled",
  missed: "Appointment window ended",
};
const errors: Record<string, string> = {
  support_unavailable:
    "Assistance is unavailable now. Choose another time or request staff guidance.",
  visit_early: "Arrival confirmation opens 15 minutes before your appointment.",
  visit_late:
    "The arrival window has ended. Change your appointment time or ask on-site staff for help.",
  visit_input: "Check the meeting point, service and time.",
  visit_date: "Choose a valid date.",
  visit_receipt: "The appointment link is not valid.",
  visit_missing: "The appointment could not be found.",
  visit_consent:
    "Confirm that your assistance details may be shared with staff.",
  visit_party:
    "Choose between 1 and 20 people and select the assistance needed.",
  visit_service: "Choose the assistance that matches this service.",
  visit_recognition: "Use no more than 100 characters for recognition details.",
  visit_registration:
    "Your saved registration is unavailable. Check it or book without a registration.",
  visit_time:
    "Choose an available 30-minute slot within the operating hours and the next seven days.",
  visit_rate: "Too many attempts. Try again later or ask on-site staff.",
  visit_full:
    "That slot is full. Choose another time; an existing booking is unchanged.",
  visit_stale:
    "The appointment was updated. Check the latest status and try again.",
  visit_ended: "This appointment has ended.",
  visit_serving:
    "Assistance has started. Ask the staff member before ending it.",
  visit_busy:
    "The robot is assisting someone or returning. Wait here or request staff assistance.",
  visit_stage:
    "This action is unavailable in the current stage. Check the latest status.",
  visit_reference: "Enter the eight-character appointment reference.",
  visit_reference_missing:
    "No appointment was found today. Check the date and reference.",
  kiosk_required: "Use an installed airport device.",
  kiosk_meeting_point:
    "Use the device at your booked meeting point, or confirm on your own phone.",
  shared_device: "Use the appointment confirmation screen for shared devices.",
};
export function visitError(
  body: { error?: string; errorEn?: string; code?: string },
  en: boolean,
) {
  return en
    ? (body.errorEn ??
        errors[body.code ?? ""] ??
        "Unable to complete the action. Check your connection and try again.")
    : (body.error ?? "처리하지 못했습니다. 다시 확인해 주세요.");
}
export function visitActionLabel(action: string, en: boolean) {
  const labels: Record<string, [string, string]> = {
    book: ["예약 확정", "Booked"],
    reschedule: ["예약 변경", "Appointment changed"],
    checkin: ["도착 확인", "Arrival confirmed"],
    checked_in: ["도착 확인", "Arrival confirmed"],
    respond: ["안내 시작", "Guidance started"],
    responding: ["안내 시작", "Guidance started"],
    complete: ["안내 완료", "Guidance completed"],
    done: ["완료", "Completed"],
    cancel: ["취소", "Cancelled"],
    cancelled: ["취소", "Cancelled"],
    missed: ["미도착 종료", "Arrival window ended"],
    handover: ["직원 인계", "Handed to staff"],
    handed_over: ["직원 인계", "Handed to staff"],
    claim: ["직원 수락", "Staff accepted"],
    assign: ["직원 수락", "Staff accepted"],
    transfer: ["담당자 인계", "Staff transfer"],
    delay: ["지연 안내", "Delay update"],
    updated: ["예약 정보 변경", "Appointment updated"],
  };
  return labels[action]?.[en ? 1 : 0] ?? (en ? "Status updated" : "상태 변경");
}
