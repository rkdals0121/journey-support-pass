import { config } from "@/lib/config";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { AssistList } from "./AssistList";
import Link from "next/link";

export const dynamic = "force-dynamic";

// 이동지원(전동차) 요청. 여객이 공항 입구 안내로봇이나 휴대전화에서 청하면 바로 여기에 뜬다.
// 안내데스크 → 관리자 메신저 → 담당 직원으로 다시 넘기지 않고, 담당 직원이 직접 받아 배정·이동·완료를 누른다.
export default async function AssistPage() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav staff-console staff-legacy-console">
        <header className="workspace-page-head">
          <div>
            <p className="eyebrow">기타 업무 · 이전 요청</p>
            <h1>이동지원 요청</h1>
          </div>
          <div className="workspace-page-tools">
            <Link href="/staff/legacy">이전 요청·인계</Link>
            <Link className="btn btn-primary" href="/staff/requests">
              접수·배정
            </Link>
          </div>
        </header>
        <p className="staff-reference-intro">
          통합 전 이동지원 요청입니다. 새 접수는 통합 요청에서 확인해 주세요.
        </p>
        <AssistList refreshSec={config.callRefreshSec} />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
