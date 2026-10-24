import { redirect } from "next/navigation";
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
  // 미리 등록하지 않은 여객에게 휴대전화로 찍을 등록 QR 을 보여 주지 않는다. 여객이 QR 을 쓰는 일이 없게 한다(피드백 2).
  // 그런 여객은 공항 입구 안내로봇에서 탑승권을 대고 등록하거나 안내데스크에서 돕는다.
  if (!place) redirect("/kiosk");
  return (
    <GuideKiosk
      placeLabel={place.label}
      placeLabelEn={place.labelEn}
      refreshSec={config.guideRefreshSec}
      idleAskSec={idleAskSec}
      idleAnswerSec={config.idleAnswerSec}
    />
  );
}
