import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { RequestList } from "./RequestList";
import { StaffSessionControls } from "./StaffSessionControls";
export const dynamic = "force-dynamic";
export default async function RequestsPage() {
  const s = await requireStaff();
  return (
    <>
      <main className="page has-nav dx-page">
        <h1>통합 요청</h1>
        <StaffSessionControls canSwitch={s.canSwitch} />
        <p>
          사전등록과 현장 접수에서 들어온 요청을 함께 처리합니다. 실제 출동이
          없는 모의 시연입니다.
        </p>
        <RequestList zoneId={s.zoneId} isDesk={s.isDesk} />
      </main>
      <StaffNav isDesk={s.isDesk} />
    </>
  );
}
