import { currentSession } from "@/lib/session-server";
import { MobilityHome } from "../components/MobilityHome";
import { HelpFlow } from "./HelpFlow";
import { helpService, kioskReturn, previewPlaceId, withPreview, type KioskReturn } from "@/lib/help-entry";
import { businessOf } from "@/lib/operating-profile";
import { supportTopic } from "@/lib/service-catalog";
import { PublicShell } from "../components/PublicShell";
import { redirect } from "next/navigation";
import { FieldTaskShell } from "../components/FieldTaskShell";
import { placeOf } from "@/lib/airport";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("현장 도움 요청", "Request help");
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{
    flow?: string;
    task?: string;
    lang?: string;
    place?: string;
    service?: string;
    returnTo?: string;
    fresh?: string;
    resume?: string;
    business?: string;
    topic?: string;
    preview?: string;
  }>;
}) {
  const q = await searchParams;
  if (q.topic === "lost-property")
    redirect("/services/lost-property" + (q.lang === "en" ? "?lang=en" : ""));
  const realSession = await currentSession();
  // 기기 화면 미리보기(?preview=1)는 설치하지 않은 화면이지만 키오스크 화면으로 그린다(링크·「이전」에도 미리보기를 잇는다).
  const previewPlace = realSession?.isKiosk ? undefined : previewPlaceId(q.preview, q.returnTo);
  const preview = !!previewPlace;
  const session = realSession?.isKiosk ? realSession : previewPlace ? { isKiosk: true as const, placeId: previewPlace } : realSession;
  const mobility = q.topic === "mobility" || (!q.topic && q.service === "mobility");
  if (mobility && !["staff","robot"].includes(q.flow??"") && q.resume !== "1") {
    const home = session?.isKiosk ? kioskReturn(q.returnTo) ?? "/kiosk/guide" : "/";
    const kioskPlace = session?.isKiosk ? placeOf(session.placeId) : undefined;
    return <MobilityHome en={q.lang==="en"} preview={preview} homeHref={withPreview(home+(q.lang==="en"?"?lang=en":""), preview)} place={session?.isKiosk?session.placeId??"":q.place??""} returnTo={session?.isKiosk?home:""}
      kiosk={session?.isKiosk ? {returnTo: home as KioskReturn, placeLabel: q.lang==="en" ? (kioskPlace?.labelEn ?? "") : (kioskPlace?.label ?? "")} : undefined}/>;
  }
  const business = businessOf(q.business);
  const topic = supportTopic(q.topic),
    lang = q.lang === "en" ? "en" : "ko";
  const flow = (
    <HelpFlow
      key={`${q.topic??"generic"}:${q.flow??""}:${q.task??""}`}
      freshPrivate={!session?.isKiosk && q.fresh === "1"}
      lang={q.lang === "en" ? "en" : "ko"}
      initialPlace={
        session?.isKiosk ? (session.placeId ?? "") : (q.place ?? "")
      }
      sharedDevice={session?.isKiosk === true}
      lockedPlace={session?.isKiosk === true}
      initialService={topic?.service ?? helpService(q.service)}
      initialTopic={topic?.id}
      initialBusiness={business?.id}
      mobilityHomeHref={mobility ? "/help?"+new URLSearchParams({topic:"mobility",...(q.lang==="en"?{lang:"en"}:{}),...(q.place?{place:q.place}:{}),...(session?.isKiosk?{returnTo:kioskReturn(q.returnTo)??"/kiosk/guide"}:{}),...(preview?{preview:"1"}:{})}).toString() : undefined}
      initialTask={mobility && q.task === "mobility-vehicle" ? q.task : undefined}
      initialMobilityMode={q.flow === "robot" && q.task !== "mobility-vehicle" ? "robot" : "staff"}
      initialNote=""
      returnTo={session?.isKiosk ? kioskReturn(q.returnTo) : undefined}
      freshShared={session?.isKiosk === true && q.fresh === "1"}
      checkExisting={q.resume === "1"}
      // 키오스크(FieldTaskShell)와 공용 화면(PublicShell) 모두 머리에 처음으로·언어·글자 크기가 있다. 본문에 같은 줄을 또 두지 않는다.
      embedded
    />
  );
  if (session?.isKiosk) {
    const place = placeOf(session.placeId);
    return (
      <FieldTaskShell
        en={lang === "en"}
        preview={preview}
        returnTo={
          kioskReturn(q.returnTo) ??
          (place?.landside ? "/kiosk/entry" : "/kiosk/guide")
        }
        place={lang === "en" ? (place?.labelEn ?? "") : (place?.label ?? "")}
      >
        {flow}
      </FieldTaskShell>
    );
  }
  return <PublicShell lang={lang}>{flow}</PublicShell>;
}
