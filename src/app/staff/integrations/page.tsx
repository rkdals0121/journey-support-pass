import { requireStaff } from "@/lib/staff-page";
import { integrationReadiness } from "@/lib/integration-config";
import { CHANNEL_LABEL } from "@/lib/integration-model";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function IntegrationsPage() {
  const session = await requireStaff();
  if (!session.isDesk) redirect("/staff/requests");
  return (
    <main className="page dx-page integration-page">
      <div className="workspace-page-head">
        <div>
          <p className="eyebrow">시스템 연결</p>
          <h1>외부 연동</h1>
        </div>
        <span className="integration-mode">연동 준비 단계</span>
      </div>
      <p>
        앱 내 접수·직원 처리는 운영 중입니다. 기관 접수와 실물 장비 연결은
        명세·시험 환경을 받은 뒤 검증합니다.
      </p>
      <div className="integration-grid">
        {integrationReadiness().map((c) => (
          <section className="integration-card" key={c.channel}>
            <span className="integration-badge">
              {c.state === "sandbox"
                ? "시험 설정됨"
                : c.state === "blocked"
                  ? "설정 확인 필요"
                  : "미연결"}
            </span>
            <h2>{CHANNEL_LABEL[c.channel]}</h2>
            <p>{c.message}</p>
            <dl>
              <div>
                <dt>실제 출동·기관 접수</dt>
                <dd>비활성</dd>
              </div>
              <div>
                <dt>필요 자료</dt>
                <dd>
                  {c.channel === "agency"
                    ? "접수·취소·처리 결과 API 명세"
                    : "제조사·모델·명령 및 상태 API 명세"}
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <section className="integration-contract">
        <h2>시험 연결 절차</h2>
        <ol>
          <li>기관·제조사 규격과 인증 방식 확인</li>
          <li>시험 중계 서버 및 장비 ID 매핑 설정</li>
          <li>접수 응답·재시도·서명된 상태 수신 검증</li>
          <li>실제 운영 전 별도 어댑터와 현장 검증</li>
        </ol>
        <p>시험 응답은 여객의 처리 완료나 실물 출동으로 반영하지 않습니다.</p>
      </section>
    </main>
  );
}
