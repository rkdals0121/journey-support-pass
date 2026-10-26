import { currentSession } from "@/lib/session-server";
import { HelpFlow } from "./HelpFlow";
import { helpService, kioskReturn } from "@/lib/help-entry";
import { businessOf } from "@/lib/operating-profile";
import { supportTopic } from "@/lib/service-catalog";
import { PublicShell } from "../components/PublicShell";
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{
    lang?: string;
    place?: string;
    service?: string;
    returnTo?: string;
    fresh?: string;
    resume?: string;
    business?: string;
    topic?: string;
  }>;
}) {
  const q = await searchParams;
  const session = await currentSession();
  const business = businessOf(q.business);
  const topic = supportTopic(q.topic),
    lang = q.lang === "en" ? "en" : "ko";
  const flow = (
    <HelpFlow
      lang={q.lang === "en" ? "en" : "ko"}
      initialPlace={
        session?.isKiosk ? (session.placeId ?? "") : (q.place ?? "")
      }
      sharedDevice={session?.isKiosk === true}
      lockedPlace={session?.isKiosk === true}
      initialService={topic?.service ?? helpService(q.service)}
      initialTopic={topic?.id}
      initialBusiness={business?.id}
      initialNote=""
      returnTo={session?.isKiosk ? kioskReturn(q.returnTo) : undefined}
      freshShared={session?.isKiosk === true && q.fresh === "1"}
      checkExisting={q.resume === "1"}
      embedded={!session?.isKiosk}
    />
  );
  if (session?.isKiosk) return flow;
  return (
    <PublicShell lang={lang}>
      <div className="public-request-layout">
        <aside className="request-guide">
          <span className="public-eyebrow">
            {lang === "en" ? "ON-SITE SUPPORT" : "현장 도움 요청"}
          </span>
          <h2>
            {topic
              ? lang === "en"
                ? topic.en
                : topic.label
              : lang === "en"
                ? "Connect with support"
                : "필요한 도움을 연결해요"}
          </h2>
          <ol>
            <li>{lang === "en" ? "Choose support" : "필요한 도움 선택"}</li>
            <li>
              {lang === "en"
                ? "Confirm your location"
                : "만날 곳·필요 정보 확인"}
            </li>
            <li>{lang === "en" ? "Review and send" : "내용 확인 후 접수"}</li>
          </ol>
          <p>
            {lang === "en"
              ? "Staff review your request before assistance is assigned."
              : "접수 후 담당자가 내용을 확인하고 지원 방법을 안내해요."}
          </p>
          {topic?.mode === "referral" && (
            <p>
              {lang === "en"
                ? "This is a staff enquiry, not an automatic application to another department."
                : "담당 창구 연결을 위한 상담 요청이에요. 다른 부서의 정식 접수가 자동 완료되는 것은 아니에요."}
            </p>
          )}
        </aside>
        {flow}
      </div>
    </PublicShell>
  );
}
