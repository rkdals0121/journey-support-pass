import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { RequestList } from "./RequestList";
import { StaffSessionControls } from "./StaffSessionControls";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function RequestsPage() {
  const s = await requireStaff();
  return (
    <>
      <main className="page has-nav dx-page">
        <div className="workspace-page-head">
          <div>
            <h1>통합 요청</h1>
            <p>사전등록·현장 접수를 함께 처리합니다 · 모의 시연</p>
          </div>
          <div className="workspace-page-tools">
            {s.isDesk && (
              <Link className="btn btn-primary" href="/staff/requests/new">
                여객 대신 접수
              </Link>
            )}
            <StaffSessionControls canSwitch={s.canSwitch} />
            <Link href="/staff/operations">운영 기준</Link>
          </div>
        </div>
        <RequestList zoneId={s.zoneId} isDesk={s.isDesk} />
      </main>
      <StaffNav isDesk={s.isDesk} />
    </>
  );
}
