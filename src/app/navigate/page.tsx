import { PublicShell } from "../components/PublicShell";
import { NavigationFlow } from "./NavigationFlow";
import { currentSession } from "@/lib/session-server";
import { placeOf } from "@/lib/airport";
import { kioskReturn, previewPlaceId } from "@/lib/help-entry";
import { FieldTaskShell } from "../components/FieldTaskShell";
import { config } from "@/lib/config";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("탑승구·시설 찾기", "Find gates and facilities");
export default async function Navigate({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; gate?: string; entry?:string; place?:string; returnTo?: string; device?: string; preview?: string }>;
}) {
  const q = await searchParams;
  const en = q.lang === "en";
  const session = await currentSession();
  // 기기 화면 미리보기(?preview=1)는 설치하지 않았지만 그 키오스크의 시연 자리로 그린다.
  const previewPlace = session?.isKiosk ? undefined : previewPlaceId(q.preview, q.returnTo);
  const preview = !!previewPlace;
  const place = session?.isKiosk ? placeOf(session.placeId) : previewPlace ? placeOf(previewPlace) : undefined;
  const returnTo =
    kioskReturn(q.returnTo) ??
    (place?.landside ? "/kiosk/entry" : "/kiosk/guide");
  const flow = (
    <NavigationFlow
      en={en}
      backHref={q.entry === "mobility" ? "/help?topic=mobility"+(en?"&lang=en":"")+(place?"&returnTo="+encodeURIComponent(returnTo):"")+(preview?"&preview=1":"") : undefined}
      initialGate={q.gate && /^\d{1,3}$/.test(q.gate) ? q.gate : ""}
      initialPlace={place?.id ?? ""}
      fixedPlace={!!place}
      robotGuidance={q.device === "robot" || (!!place && returnTo === "/kiosk/entry")}
      returnTo={returnTo}
      idleAskSec={config.idleAskSec}
      idleAnswerSec={config.idleAnswerSec}
    />
  );
  if (place)
    return (
      <FieldTaskShell
        en={en}
        preview={preview}
        returnTo={returnTo}
        place={en ? place.labelEn : place.label}
      >
        {flow}
      </FieldTaskShell>
    );
  return <PublicShell lang={en ? "en" : "ko"}>{flow}</PublicShell>;
}
