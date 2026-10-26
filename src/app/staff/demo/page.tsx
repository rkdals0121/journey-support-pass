import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff-page";
import { getDb } from "@/lib/db";
import { config } from "@/lib/config";
import { availableDemoFlight } from "@/lib/demo-flight";
import { StaffNav } from "@/app/components/StaffNav";
import { PrepareDemo } from "./PrepareDemo";
export const dynamic = "force-dynamic";
export default async function DemoPreparation() {
  const s = await requireStaff();
  if (!s.isDesk) redirect("/staff/requests");
  const initial =
    config.dataMode === "mock"
      ? await availableDemoFlight(await getDb(), new Date())
      : null;
  return (
    <>
      <main className="page has-nav dx-page demo-preparation-page">
        <h1>전체 흐름 시연 준비</h1>
        <p>
          사전등록부터 현장 지원·직원 인계·결과 확인까지 같은 요청으로
          연결합니다.
        </p>
        {config.dataMode === "mock" ? (
          <PrepareDemo initial={initial} />
        ) : (
          <p role="status">
            실제 데이터 모드에서는 시연 항공편을 추가할 수 없습니다.
          </p>
        )}
        <section className="dx-card">
          <h2>2. 여객 창과 직원 창 나누기</h2>
          <p>
            직원은 이 창을 유지하고, 여객은 별도 브라우저나 시크릿 창에서 아래
            화면을 엽니다. 현장 직원은 공통 직원 코드로 별도 로그인한 뒤 근무
            구역을 선택합니다.
          </p>
          <Link href="/demo/booking">여객 시작 화면 · 예매 완료 시연</Link>
          <p className="fine">
            여객은 걷기·보기 어려움, 계단 없는 이동, 큰 글씨, 동행인 2명을
            등록하고 위 시연편을 선택합니다. 등록만으로 현장 요청은 만들어지지
            않습니다.
          </p>
        </section>
        <section className="dx-card">
          <h2>3. 현장 요청부터 결과까지</h2>
          <ol>
            <li>
              여객의 내 등록에서 지금 도움 요청을 시작합니다. 만날 곳은 탑승동
              중앙 116번 앞, 목적지는 130번 앞을 선택합니다.
            </li>
            <li>
              안내데스크는 통합 요청에서 탑승동 중앙부에 배정합니다. 필요하면
              장비 대장에서 시연용 이동 장비를 등록하고 배차합니다.
            </li>
            <li>
              중앙부 직원이 출발·도착을 기록하고 안내데스크가 목적지의 끝단
              구역에 사유와 함께 인계합니다.
            </li>
            <li>
              끝단 직원이 이동지원을 진행하고 직접 확인한 처리 결과를 남깁니다.
              여객의 요청·내 등록과 통합 운영 현황에서 확인합니다.
            </li>
          </ol>
          <p className="fine">
            모든 이동·장비·직원 조작은 공모전 시연입니다. 실제 장비 출동이나
            부서 시스템 수신 확인으로 설명하지 않습니다.
          </p>
        </section>
        <div className="demo-preparation-links">
          <Link href="/staff/requests">통합 요청 처리</Link>
          <Link href="/staff/resources">시연 장비 대장</Link>
          <Link href="/staff/overview">통합 운영 현황</Link>
        </div>
      </main>
      <StaffNav isDesk />
    </>
  );
}
