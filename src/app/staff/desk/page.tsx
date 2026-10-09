import { BarChart3, ChevronRight, Lock, UserPlus } from "lucide-react";
import Link from "next/link";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { DeskFind } from "./DeskFind";

export const dynamic = "force-dynamic";

export default async function DeskPage() {
  const session = await requireStaff();
  if (!session.isDesk) {
    return (
      <>
        <main className="page has-nav">
          <div className="empty">
            <span className="bubble">
              <Lock size={28} aria-hidden="true" />
            </span>
            <strong>안내데스크에서만 쓸 수 있습니다</strong>
            <p>대신 등록과 패스 찾기는 안내데스크 코드로 로그인해야 쓸 수 있습니다.</p>
          </div>
          <Link className="btn" href="/staff">
            호출 화면으로
          </Link>
        </main>
        <StaffNav isDesk={false} />
      </>
    );
  }
  return (
    <>
      <main className="page has-nav">
        <h1>안내데스크</h1>
        <p className="muted">키오스크를 쓰기 어려운 여객을 대신 등록하고, 패스를 다시 뽑거나 지웁니다.</p>

        <Link className="desk-card" href="/staff/desk/register">
          <span className="bubble">
            <UserPlus size={24} aria-hidden="true" />
          </span>
          <span>
            <strong>여객 대신 등록하기</strong>
            <small>여객께 여쭤보며 대신 누르고 스티커를 뽑아 드립니다</small>
          </span>
          <ChevronRight size={22} aria-hidden="true" />
        </Link>
        <Link className="desk-card" href="/staff/desk/stats">
          <span className="bubble">
            <BarChart3 size={24} aria-hidden="true" />
          </span>
          <span>
            <strong>오늘 현황</strong>
            <small>등록, 안내, 직원 호출 건수</small>
          </span>
          <ChevronRight size={22} aria-hidden="true" />
        </Link>

        <h2>패스 찾기</h2>
        <DeskFind />
      </main>
      <StaffNav isDesk />
    </>
  );
}
