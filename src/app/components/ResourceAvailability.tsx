import { RESOURCE_KIND, type DispatchResource } from "@/lib/resource-model";
export function ResourceAvailability({
  resources,
}: {
  resources: DispatchResource[];
}) {
  return (
    <section className="dx-card" aria-label="현재 장비 가용 현황">
      <h2>현재 장비 가용 현황 · 시범 대장</h2>
      {resources.length === 0 ? (
        <p>
          등록된 장비가 없습니다. 장비를 배차하지 않은 이동 단계는 모의
          시연입니다.
        </p>
      ) : (
        <dl className="dx-summary">
          {(["robot", "mobility"] as const).map((kind) => {
            const rows = resources.filter((r) => r.kind === kind);
            return (
              <div key={kind}>
                <dt>{RESOURCE_KIND[kind]}</dt>
                <dd>
                  가용{" "}
                  {
                    rows.filter((r) => r.status === "ready" && !r.requestId)
                      .length
                  }
                  대 · 배차 {rows.filter((r) => r.requestId).length}대 ·
                  점검/중지{" "}
                  {
                    rows.filter((r) => r.status !== "ready" && !r.requestId)
                      .length
                  }
                  대
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="fine">
        장비의 실제 위치·상태를 자동 수신한 값이 아닙니다. 담당자가 등록하고
        배차한 현재 수량입니다.
      </p>
    </section>
  );
}
