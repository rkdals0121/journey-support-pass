import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { AlertOverview } from "./AlertOverview";
export const dynamic = "force-dynamic";
export default async function AlertsPage() {
  const session = await requireStaff();
  if (!session.isDesk) redirect("/staff/requests");
  return (
    <>
      <main className="page has-nav dx-page">
        <h1>알림 운영 현황</h1>
        <Link className="btn" href="/staff/requests">
          통합 요청으로 돌아가기
        </Link>
        <AlertOverview />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
