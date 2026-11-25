import Link from "next/link";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { ArrowRight, Bell, Accessibility, Inbox } from "lucide-react";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("이전 요청·인계");
export const dynamic = "force-dynamic";
export default async function LegacyRequests() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav staff-reference-page">
        <header className="workspace-page-head">
          <div>
            <h1>이전 요청·인계</h1>
          </div>
        </header>
        <div className="staff-destination-grid">
          <Link
            className="staff-destination-card is-primary"
            href="/staff/requests"
          >
            <Inbox aria-hidden="true" />
            <h2>접수·배정</h2>
            <p>새 현장 요청 확인과 담당자 배정</p>
            <span>
              접수·배정으로 <ArrowRight size={18} aria-hidden="true" />
            </span>
          </Link>
          <Link className="staff-destination-card" href="/staff/legacy/calls">
            <Bell aria-hidden="true" />
            <h2>이전 직원 호출</h2>
            <p>통합 전 접수된 직원 호출 기록</p>
            <span>
              기록 확인 <ArrowRight size={18} aria-hidden="true" />
            </span>
          </Link>
          <Link className="staff-destination-card" href="/staff/assist">
            <Accessibility aria-hidden="true" />
            <h2>이전 이동지원</h2>
            <p>기존 이동지원 요청과 인계 내역</p>
            <span>
              내역 확인 <ArrowRight size={18} aria-hidden="true" />
            </span>
          </Link>
        </div>
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
