import { redirect } from "next/navigation";
import { placeOf } from "@/lib/airport";
import { config } from "@/lib/config";
import { currentSession } from "@/lib/session-server";
import { EntryKiosk } from "./EntryKiosk";

export const dynamic = "force-dynamic";

// 공항 입구의 교통약자 전용 안내 키오스크(안내로봇). 설치 코드로 키오스크가 된 기기에서만 열린다.
export default async function KioskEntryPage({ searchParams }: { searchParams: Promise<{ idle?: string; lang?: string }> }) {
  const q = await searchParams;
  // 화면 점검이 "계속 이용하시겠어요?"를 오래 기다리지 않게, 개발 서버에서만 시간을 줄일 수 있다.
  const idle = process.env.NODE_ENV !== "production" ? Number((await searchParams).idle) : Number.NaN;
  const session = await currentSession();
  const place = session?.isKiosk ? placeOf(session.placeId) : null;
  if (!place) redirect("/kiosk");
  return (
    <EntryKiosk
      initialLang={q.lang === "en" ? "en" : "ko"}
      placeLabel={place.label}
      placeLabelEn={place.labelEn}
      idleAskSec={Number.isFinite(idle) && idle > 0 ? idle : config.idleAskSec}
      idleAnswerSec={config.idleAnswerSec}
    />
  );
}
