import Link from "next/link";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
export const dynamic = "force-dynamic";
export default async function LegacyRequests() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav">
        <h1>이전 요청 확인</h1>
        <p>
          통합 전에 접수된 기록과 남아 있는 요청을 확인합니다. 새 현장 요청은
          모두 통합 요청에서 처리합니다.
        </p>
        <Link className="btn btn-primary" href="/staff/requests">
          통합 요청으로
        </Link>
        <Link className="btn" href="/staff/legacy/calls">
          이전 직원 호출
        </Link>
        <Link className="btn" href="/staff/assist">
          이전 이동지원
        </Link>
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
