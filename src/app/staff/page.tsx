import { config } from "@/lib/config";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../components/StaffNav";
import { CallList } from "./CallList";

export const dynamic = "force-dynamic";

// 직원의 첫 화면. 여객이 키오스크에서 누른 「직원 부르기」가 여기에 뜬다.
export default async function StaffPage() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav">
        <CallList refreshSec={config.callRefreshSec} />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
