import Link from "next/link";
import { ArrowUpRight, Plane, Stamp } from "lucide-react";
import { MyRequestPanel } from "./MyRequestPanel";
export function PortalSupport({ lang = "ko", showRequests = true, showPrepare = true }: { lang?: "ko" | "en"; showRequests?: boolean; showPrepare?: boolean }) {
  const en = lang === "en";
  return (
    <>
      {showPrepare && <article className="task-action">
        <Plane className="task-action-icon" aria-hidden="true" />
        <Link className="task-action-link" href={"/prepare" + (en ? "?lang=en" : "")}>
          <span><strong>{en ? "Before you travel" : "여행 전 지원 등록"}</strong><small>{en ? "Save your flight and support needs." : "항공편과 필요한 도움을 미리 등록하세요."}</small></span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </article>}
      <article className="task-action">
        <Stamp className="task-action-icon" aria-hidden="true" />
        <Link className="task-action-link" href="/stamp">
          <span><strong>{en ? "Airport stamp book (Korean)" : "공항 스탬프북"}</strong><small>{en ? "Collect six checkpoint stamps." : "아이와 체크포인트 도장 6개를 모아요."}</small></span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </article>
      {showRequests && <MyRequestPanel lang={lang} appearance="service-card" />}
    </>
  );
}
