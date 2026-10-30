import { config } from "@/lib/config";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../../components/StaffNav";
import { CallList } from "../../CallList";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function LegacyCalls() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav staff-console staff-legacy-console">
        <header className="workspace-page-head">
          <div>
            <p className="eyebrow">기타 업무 · 이전 요청</p>
            <h1>이전 직원 호출</h1>
          </div>
          <div className="workspace-page-tools">
            <Link href="/staff/legacy">이전 요청·인계</Link>
            <Link className="btn btn-primary" href="/staff/requests">
              접수·배정
            </Link>
          </div>
        </header>
        <p className="staff-reference-intro">
          통합 전 접수된 호출을 확인하는 화면입니다. 새 요청은 통합 요청
          화면에서 처리합니다.
        </p>
        <CallList refreshSec={config.callRefreshSec} />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
