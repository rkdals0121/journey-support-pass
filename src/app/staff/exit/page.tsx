import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { ExitCheck } from "./ExitCheck";

export const dynamic = "force-dynamic";

// 교통약자 우대출구 직원 화면. 여객의 탑승권(전자토큰)을 찍으면 대상 여부와 필요한 지원만 나온다.
// 시제품에서는 로그인한 직원 누구나 쓸 수 있다. 실제로는 우대출구 근무자에게만 연다.
export default async function ExitPage() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav">
        <h1>교통약자 우대출구</h1>
        <p className="muted">여객의 모바일 탑승권 QR을 찍어 주세요. 증빙서류는 요구하지 않습니다. 대상 여부와 필요한 지원만 나옵니다.</p>
        <ExitCheck />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
