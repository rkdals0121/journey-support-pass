import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/staff-page";
import { getDb } from "@/lib/db";
import { businessOverview } from "@/lib/business-overview";
import { StaffNav } from "@/app/components/StaffNav";
import { OverviewDashboard } from "./OverviewDashboard";
export const dynamic = "force-dynamic";
export default async function OverviewPage() {
  const s = await requireStaff();
  if (!s.isDesk) redirect("/staff/requests");
  const initial = await businessOverview(await getDb(), new Date());
  return (
    <>
      <main className="page has-nav dx-page overview-page">
        <div className="workspace-page-head">
          <div>
            <h1>통합 운영 현황</h1>
            <p>접수 경로를 함께 보고, 담당 업무별로 처리합니다 · 모의 시연</p>
          </div>
          <div className="workspace-page-tools">
            <Link className="btn btn-primary" href="/staff/requests">
              요청 처리
            </Link>
            <Link href="/staff/desk/stats">사전등록·이용 지표</Link>
          </div>
        </div>
        <OverviewDashboard initial={initial} />
      </main>
      <StaffNav isDesk />
    </>
  );
}
