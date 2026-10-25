import { config } from "@/lib/config";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../../components/StaffNav";
import { CallList } from "../../CallList";
export const dynamic = "force-dynamic";
export default async function LegacyCalls() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav">
        <h1>이전 직원 호출</h1>
        <p>
          통합 전 접수된 호출을 확인하는 화면입니다. 새 요청은 통합 요청
          화면에서 처리합니다.
        </p>
        <CallList refreshSec={config.callRefreshSec} />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
