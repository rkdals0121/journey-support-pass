import Link from "next/link";
import { ArrowUpRight, Plane, Stamp } from "lucide-react";
import { MyRequestPanel } from "./MyRequestPanel";
type PortalSupportProps = { lang?: "ko" | "en"; showRequests?: boolean; showPrepare?: boolean };
export function portalSupportCards({ lang = "ko", showRequests = true, showPrepare = true }: PortalSupportProps = {}) {
  const en = lang === "en";
  return [
      ...(showPrepare ? [<article className="task-action" key="prepare">
        <Plane className="task-action-icon" aria-hidden="true" />
        <Link className="task-action-link" href={"/prepare" + (en ? "?lang=en" : "")}>
          <span><strong>{en ? "Get help from arrival to boarding" : "출발부터 탑승까지 도움 신청"}</strong><small>{en ? "Save your flight and support needs." : "항공편과 필요한 도움을 미리 등록하세요."}</small></span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </article>] : []),
      <article className="task-action" key="stamp">
        <Stamp className="task-action-icon" aria-hidden="true" />
        <Link className="task-action-link" href={"/stamp" + (en ? "?lang=en" : "")}>
          <span><strong>{en ? "Airport stamp book" : "공항 스탬프북"}</strong><small>{en ? "Collect six checkpoint stamps." : "아이와 체크포인트 도장 6개를 모아요."}</small></span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </article>,
      ...(showRequests ? [<MyRequestPanel key="requests" lang={lang} appearance="service-card" />] : []),
  ];
}
export function PortalSupport(props: PortalSupportProps) {
  return <>{portalSupportCards(props)}</>;
}
