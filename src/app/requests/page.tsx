import { PublicShell } from "../components/PublicShell";
import { SavedVisits } from "../visits/SavedVisits";
import { MyRequests } from "./MyRequests";
import { currentSession } from "@/lib/session-server";
import { placeOf } from "@/lib/airport";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/page-title";
import { kioskHomeHref, kioskReturn } from "@/lib/help-entry";

export const generateMetadata = pageTitle("내 요청", "My requests");
export default async function Requests({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; entry?: string; preview?: string; returnTo?: string }>;
}) {
  const { lang, entry, preview, returnTo } = await searchParams;
  const en = lang === "en";
  const session = await currentSession();
  if (session?.isKiosk)
    redirect(
      placeOf(session.placeId)?.landside ? "/kiosk/entry" : "/kiosk/guide",
    );
  // 기기 화면 미리보기(?preview=1)도 실제 키오스크처럼 그 키오스크 처음 화면으로 돌려보낸다(여객 웹 화면으로 바뀌지 않게).
  if (preview === "1" && kioskReturn(returnTo))
    redirect(kioskHomeHref(kioskReturn(returnTo)!, en, true));
  return (
    <PublicShell lang={en ? "en" : "ko"}>
      <MyRequests en={en} backHref={entry === "mobility" ? "/help?topic=mobility" + (en ? "&lang=en" : "") : undefined}>
        <SavedVisits en={en} />
      </MyRequests>
    </PublicShell>
  );
}
