import { SERVICE_TYPES, type ServiceType } from "./service-request-model";
export const KIOSK_RETURNS = [
  "/kiosk/entry",
  "/kiosk/guide",
  "/kiosk/register",
] as const;
export type KioskReturn = (typeof KIOSK_RETURNS)[number];
export function kioskReturn(value: unknown): KioskReturn | undefined {
  return KIOSK_RETURNS.includes(value as KioskReturn)
    ? (value as KioskReturn)
    : undefined;
}
export function helpService(value: unknown): ServiceType {
  return SERVICE_TYPES.includes(value as ServiceType)
    ? (value as ServiceType)
    : "guidance";
}
export function kioskHelpHref(
  token: string | null,
  lang: "ko" | "en",
  service: ServiceType,
  returnTo: KioskReturn,
  resume = false,
  preview = false,
) {
  const linked = token && /^[A-Za-z0-9]{16}$/.test(token);
  const params = new URLSearchParams({ lang, service, returnTo });
  if (!resume) params.set("fresh", "1");
  else params.set("resume", "1");
  return withPreview(`${linked ? `/p/${token}/help` : "/help"}?${params}`, preview);
}

/*
 * 기기 화면 미리보기(/devices 의 실제 화면 틀, 주소에 ?preview=1).
 * 설치 코드 없이 시연 자리로 키오스크 화면을 보여 준다. 다음 화면(도움 요청·이동 도움·길 찾기·만남 예약)으로 옮겨도
 * 미리보기를 이어야 한다. 잇지 않으면 「현장 기기 설치」나 여객 웹 화면으로 바뀌었다(부록 작업 중 받은 피드백).
 * 설치 쿠키가 없으므로 서버에 남기는 기능(등록 조회, 접수)은 실제 기기에서만 된다.
 */
const PREVIEW_PLACE: Record<KioskReturn, string> = {
  "/kiosk/entry": "t1-info",
  "/kiosk/guide": "cc-center",
  "/kiosk/register": "t1-info",
};
/** 미리보기면 그 화면이 돌아갈 키오스크(returnTo)의 시연 자리. 미리보기가 아니면 undefined. */
export function previewPlaceId(preview: unknown, returnTo: unknown): string | undefined {
  if (preview !== "1") return undefined;
  return PREVIEW_PLACE[kioskReturn(returnTo) ?? "/kiosk/guide"];
}
/** 미리보기 중이면 주소에 preview=1 을 붙인다. */
export function withPreview(href: string, preview?: boolean) {
  if (!preview) return href;
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}preview=1${hash ? "#" + hash : ""}`;
}
/** 키오스크 처음 화면 주소(언어·미리보기 포함). */
export function kioskHomeHref(returnTo: string, en: boolean, preview?: boolean) {
  return withPreview(returnTo + (en ? "?lang=en" : ""), preview);
}
