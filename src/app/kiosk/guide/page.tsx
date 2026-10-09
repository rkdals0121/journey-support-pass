import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { placeOf } from "@/lib/airport";
import { config } from "@/lib/config";
import { currentSession } from "@/lib/session-server";
import { GuideKiosk } from "./GuideKiosk";

export const dynamic = "force-dynamic";

// 안내 키오스크. 설치 코드로 키오스크가 된 기기에서만 열린다.
export default async function KioskGuidePage({ searchParams }: { searchParams: Promise<{ idle?: string }> }) {
  // 화면 점검(scripts/e2e.ts)이 "계속 이용하시겠어요?"를 오래 기다리지 않고 확인할 수 있게, 개발 서버에서만 시간을 줄일 수 있다.
  const idle = process.env.NODE_ENV !== "production" ? Number((await searchParams).idle) : Number.NaN;
  const idleAskSec = Number.isFinite(idle) && idle > 0 ? idle : config.idleAskSec;
  const session = await currentSession();
  const place = session?.isKiosk ? placeOf(session.placeId) : null;
  if (!place) redirect("/kiosk");
  // 아직 등록하지 않은 여객이 자기 휴대전화로 찍어 바로 등록할 수 있게, 등록 화면의 주소를 QR 로 보여 준다.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const registerQr = await QRCode.toString(`${proto}://${host}/register`, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  return (
    <GuideKiosk
      placeLabel={place.label}
      placeLabelEn={place.labelEn}
      refreshSec={config.guideRefreshSec}
      registerQr={registerQr}
      idleAskSec={idleAskSec}
      idleAnswerSec={config.idleAnswerSec}
    />
  );
}
