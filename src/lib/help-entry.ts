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
) {
  const linked = token && /^[A-Za-z0-9]{16}$/.test(token);
  const params = new URLSearchParams({ lang, service, returnTo });
  if (!resume) params.set("fresh", "1");
  else params.set("resume", "1");
  return `${linked ? `/p/${token}/help` : "/help"}?${params}`;
}
