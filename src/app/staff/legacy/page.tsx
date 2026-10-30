import Link from "next/link";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { ArrowUpRight, Bell, Accessibility, Inbox } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function LegacyRequests() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav staff-reference-page">
        <header className="workspace-page-head">
          <div>
            <p className="eyebrow">기타 업무</p>
            <h1>이전 요청·인계</h1>
          </div>
        </header>
        <p className="staff-reference-intro">
          통합 전에 접수된 기록과 남아 있는 요청을 확인합니다. 새 현장 요청은
          모두 통합 요청에서 처리합니다.
        </p>
        <div className="staff-destination-grid">
          <Link
            className="staff-destination-card is-primary"
            href="/staff/requests"
          >
            <Inbox aria-hidden="true" />
            <h2>접수·배정</h2>
            <p>새 현장 요청 확인과 담당자 배정</p>
            <span>
              통합 요청으로 <ArrowUpRight size={18} aria-hidden="true" />
            </span>
          </Link>
          <Link className="staff-destination-card" href="/staff/legacy/calls">
            <Bell aria-hidden="true" />
            <h2>이전 직원 호출</h2>
            <p>통합 전 접수된 직원 호출 기록</p>
            <span>
              기록 확인 <ArrowUpRight size={18} aria-hidden="true" />
            </span>
          </Link>
          <Link className="staff-destination-card" href="/staff/assist">
            <Accessibility aria-hidden="true" />
            <h2>이전 이동지원</h2>
            <p>기존 이동지원 요청과 인계 내역</p>
            <span>
              내역 확인 <ArrowUpRight size={18} aria-hidden="true" />
            </span>
          </Link>
        </div>
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
