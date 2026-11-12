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
          <span><strong>{en ? "Before you travel" : "여행 전 지원 등록"}</strong></span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </article>] : []),
      <article className="task-action" key="stamp">
        <Stamp className="task-action-icon" aria-hidden="true" />
        <Link className="task-action-link" href={"/stamp" + (en ? "?lang=en" : "")}>
          <span><strong>{en ? "Airport stamp book" : "공항 스탬프북"}</strong></span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </article>,
      ...(showRequests ? [<MyRequestPanel key="requests" lang={lang} appearance="service-card" />] : []),
  ];
}
export function PortalSupport(props: PortalSupportProps) {
  return <>{portalSupportCards(props)}</>;
}
