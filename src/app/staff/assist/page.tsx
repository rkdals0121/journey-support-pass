import { config } from "@/lib/config";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { AssistList } from "./AssistList";

export const dynamic = "force-dynamic";

// 이동지원(전동차) 요청. 여객이 공항 입구 안내로봇이나 휴대전화에서 청하면 바로 여기에 뜬다.
// 안내데스크 → 관리자 메신저 → 담당 직원으로 다시 넘기지 않고, 담당 직원이 직접 받아 배정·이동·완료를 누른다.
export default async function AssistPage() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav">
        <h1>이동지원 요청</h1>
        <p className="muted">여객이 청한 전동차 이동지원입니다. 받으면 여객 화면에 "직원 배정됨"이 바로 보입니다. 여객의 필요한 지원과 항공편만 나옵니다.</p>
        <AssistList refreshSec={config.callRefreshSec} />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
