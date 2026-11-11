import { redirect } from "next/navigation";
import { placeOf } from "@/lib/airport";
import { config } from "@/lib/config";
import { currentSession } from "@/lib/session-server";
import { EntryKiosk } from "./EntryKiosk";
import { RobotStage } from "./RobotStage";

export const dynamic = "force-dynamic";

// 공항 입구의 교통약자 전용 안내 키오스크(안내로봇). 설치 코드로 키오스크가 된 기기에서만 열린다.
export default async function KioskEntryPage({ searchParams }: { searchParams: Promise<{ idle?: string; lang?: string; preview?: string; view?: string; inner?: string }> }) {
  const q = await searchParams;
  // 화면 점검이 "계속 이용하시겠어요?"를 오래 기다리지 않게, 개발 서버에서만 시간을 줄일 수 있다.
  const idle = process.env.NODE_ENV !== "production" ? Number((await searchParams).idle) : Number.NaN;
  const session = await currentSession();
  // 기기 화면 미리보기(/devices)가 실제 화면을 그대로 띄울 수 있게, ?preview=1 이면 설치 없이 시연 자리로 연다.
  // 설치 쿠키가 없어서 서버와 통신하는 기능(등록 조회, 도움 요청)은 동작하지 않는다.
  const place = session?.isKiosk ? placeOf(session.placeId) : q.preview === "1" ? placeOf("t1-info") : null;
  if (!place) redirect("/kiosk");
  const lang = q.lang === "en" ? "en" : "ko";
  // 시연용 전환: ?view=device 이면 로봇 크기(1080×1920)에 맞춘 틀 안에 같은 화면을 넣는다(inner=1 이 그 안의 화면).
  if (q.view === "device" && q.inner !== "1") return <RobotStage lang={lang} />;
  return (
    <EntryKiosk
      initialLang={lang}
      switchMode={q.preview === "1" ? undefined : q.inner === "1" ? "device" : "pc"}
      placeLabel={place.label}
      placeLabelEn={place.labelEn}
      idleAskSec={Number.isFinite(idle) && idle > 0 ? idle : config.idleAskSec}
      idleAnswerSec={config.idleAnswerSec}
    />
  );
}
