import { redirect } from "next/navigation";
import { placeOf } from "@/lib/airport";
import { config } from "@/lib/config";
import { currentSession } from "@/lib/session-server";
import { RegisterKiosk } from "./RegisterKiosk";

export const dynamic = "force-dynamic";

// 등록 키오스크. 설치 코드로 키오스크가 된 기기에서만 열린다.
export default async function KioskRegisterPage({ searchParams }: { searchParams: Promise<{ idle?: string }> }) {
  // 화면 점검(scripts/e2e.ts)이 "계속 이용하시겠어요?"를 오래 기다리지 않고 확인할 수 있게, 개발 서버에서만 시간을 줄일 수 있다.
  const idle = process.env.NODE_ENV !== "production" ? Number((await searchParams).idle) : Number.NaN;
  const idleAskSec = Number.isFinite(idle) && idle > 0 ? idle : config.idleAskSec;
  const session = await currentSession();
  const place = session?.isKiosk ? placeOf(session.placeId) : null;
  if (!place) redirect("/kiosk");
  return (
    <RegisterKiosk
      placeLabel={place.label}
      placeLabelEn={place.labelEn}
      idleAskSec={idleAskSec}
      idleAnswerSec={config.idleAnswerSec}
    />
  );
}
