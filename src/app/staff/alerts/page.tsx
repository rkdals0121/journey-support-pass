import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { AlertOverview } from "./AlertOverview";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("알림 운영 현황");
export const dynamic = "force-dynamic";
export default async function AlertsPage() {
  const session = await requireStaff();
  if (!session.isDesk) redirect("/staff/requests");
  return (
    <>
      <main className="page has-nav dx-page">
        {/* 다른 직원 화면과 같은 머리 줄: 제목은 왼쪽, 이동 단추는 오른쪽 알약(화면 폭 전체로 늘어난 단추이던 것) */}
        <header className="workspace-page-head">
          <div>
            <p className="eyebrow">운영 관리</p>
            <h1>알림 운영 현황</h1>
          </div>
          <div className="workspace-page-tools">
            <Link className="btn" href="/staff/requests">
              통합 요청으로 돌아가기
            </Link>
          </div>
        </header>
        <AlertOverview />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
