import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session-server";
import { placeOf } from "@/lib/airport";
import { previewPlaceId } from "@/lib/help-entry";
import { SERVICE_HUBS } from "@/lib/service-hubs";
import { config } from "@/lib/config";
import { KioskVisitFlow } from "./KioskVisitFlow";
export const dynamic = "force-dynamic";
export const metadata = { title: "만남 예약 확인 (키오스크) · Journey Support Pass", robots: { index: false, follow: false } };
export default async function KioskVisits({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; preview?: string; returnTo?: string }>;
}) {
  const q = await searchParams;
  const session = await currentSession();
  // 기기 화면 미리보기(?preview=1)는 설치하지 않았지만 그 키오스크의 시연 자리로 그린다(조회는 설치한 기기에서만).
  const placeId = session?.isKiosk ? session.placeId : previewPlaceId(q.preview, q.returnTo);
  if (!placeId) redirect("/kiosk");
  const place = placeOf(placeId)!;
  const hub = SERVICE_HUBS.find((h) => h.placeId === place.id);
  return (
    <KioskVisitFlow
      en={q.lang === "en"}
      hubId={hub?.id}
      place={place.label}
      returnTo={place.landside ? "/kiosk/entry" : "/kiosk/guide"}
      askSec={config.idleAskSec}
      answerSec={config.idleAnswerSec}
    />
  );
}
