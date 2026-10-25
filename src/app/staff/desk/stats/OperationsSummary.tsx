import type { OperationalSummary } from "@/lib/service-request-model";
import { SERVICE_LABEL } from "@/lib/service-request-model";
export function OperationsSummary({ value: s }: { value: OperationalSummary }) {
  const channels: Record<string, string> = {
    web: "현장 웹",
    preregistered: "사전등록 연결 웹",
    kiosk: "키오스크",
    assisted: "직원 대리 접수",
  };
  return (
    <section className="dx-card">
      <h2>통합 업무 현황</h2>
      <p>
        새 통합 요청과 이전 호출·이동지원을 함께 집계합니다. 시간 초과는 완료에
        포함하지 않습니다.
      </p>
      <dl className="dx-summary">
        {[
          ["전체 접수", s.total],
          ["사전등록 정보 연결", s.linked],
          ["진행 중", s.active],
          ["미배정", s.received],
          ["완료", s.done],
          ["취소", s.cancelled],
          ["지원 불가", s.unavailable],
          ["시간 초과", s.expired],
          ["확인 지연 · 운영자 점검", s.awaitingAttention],
        ].map(([label, n]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{n}건</dd>
          </div>
        ))}
        <div>
          <dt>접수→배정 중앙값</dt>
          <dd>
            {s.medianAcceptSec === null
              ? "자료 없음"
              : `${s.medianAcceptSec}초`}
          </dd>
        </div>
      </dl>
      <h3>서비스별 접수</h3>
      <ul>
        {Object.entries(s.byService).map(([service, n]) => (
          <li key={service}>
            {SERVICE_LABEL[service as keyof typeof SERVICE_LABEL]}: {n}건
          </li>
        ))}
      </ul>
      <h3>접수 경로</h3>
      <ul>
        {Object.entries(s.bySource).map(([source, n]) => (
          <li key={source}>
            {channels[source] ?? source}: {n}건
          </li>
        ))}
      </ul>
      <p className="fine">
        이전 기록: 직원 호출 {s.byQueue.call}건 · 이동지원 {s.byQueue.assist}건.
        등록 연결은 접수 건수의 부분집합이며 별도 접수로 더하지 않습니다.
      </p>
    </section>
  );
}
