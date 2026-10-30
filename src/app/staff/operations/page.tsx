import Link from "next/link";
import { requireStaff } from "@/lib/staff-page";
import { PLACES } from "@/lib/airport";
import {
  BUSINESS_AREAS,
  BUSINESS_GROUPS,
  BUSINESS_SOURCE,
  PROFILE_DATE,
  ACCESS_LABEL,
  PILOT_RULES,
  pilotDestinations,
  pilotResourceState,
} from "@/lib/operating-profile";
import { resourceSnapshot } from "@/lib/dispatch-resources";
import { getDb } from "@/lib/db";
import { expireServiceRequests } from "@/lib/request-retention";
import { StaffNav } from "../../components/StaffNav";
import { StaffReferenceTabs } from "../../components/StaffReferenceTabs";
export const dynamic = "force-dynamic";
export default async function OperationsPage() {
  const s = await requireStaff();
  const db = await getDb();
  await expireServiceRequests(db, new Date());
  const resources = await resourceSnapshot(db);
  const counts = resources.reduce(
    (all, r) => {
      all[pilotResourceState(r)]++;
      return all;
    },
    { available: 0, busy: 0, maintenance: 0, offline: 0 },
  );
  return (
    <>
      <main className="page has-nav dx-page staff-reference-page">
        <header className="workspace-page-head">
          <div>
            <p className="eyebrow">운영 관리</p>
            <h1>운영 기준·담당 업무</h1>
          </div>
          <div className="workspace-page-tools">
            <Link href="/staff/requests">접수·배정</Link>
            <Link href="/staff/resources">장비 현황·배차</Link>
          </div>
        </header>
        <p className="staff-reference-intro">
          공모전 시연 기준 · {PROFILE_DATE}. 업무 범위는 공식 자료를 참고했고,
          장소·시간·배차 기준은 팀이 정한 시연 설정입니다.
        </p>
        <StaffReferenceTabs
          labels={["접수·처리", "장비 가용", "거점·목적지", "담당 업무"]}
        >
          <section id="service-rules" className="staff-reference-panel">
            <span className="staff-section-index">01 · SERVICE</span>
            <h2>접수·처리 기준</h2>
            <dl className="dx-summary">
              <div>
                <dt>접수 시간 · 한국시간</dt>
                <dd>{PILOT_RULES.reception}</dd>
              </div>
              <div>
                <dt>시연 처리 시간</dt>
                <dd>{PILOT_RULES.service}</dd>
              </div>
            </dl>
            <p>{PILOT_RULES.ownership}</p>
            <p>
              현재 앱의 직접 처리 흐름은 직원 안내·안내로봇 모의 호출·이동지원
              상담입니다. 각 사업의 전문 업무는 직원이 담당 부서와 협의하며,
              접수·배정은 실제 전문 업무의 실행이나 예약 확정을 뜻하지 않습니다.
            </p>
          </section>
          <section id="equipment-rules" className="staff-reference-panel">
            <span className="staff-section-index">02 · EQUIPMENT</span>
            <h2>시연 장비 가용 기준</h2>
            <p>
              {PILOT_RULES.equipment}. 담당 구역 또는 안내데스크가 지원 시작
              전에 배차하며, 위치 변경 확인 중에는 배차하지 않습니다.
            </p>
            <dl className="dx-summary">
              {(
                [
                  ["가용", counts.available],
                  ["배차 중", counts.busy],
                  ["점검 중", counts.maintenance],
                  ["운영 중지", counts.offline],
                ] as const
              ).map(([label, n]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{n}대</dd>
                </div>
              ))}
            </dl>
            <p className="fine">
              장비 대장을 조회한 시점의 수량입니다. 실제 배터리·위치·고장
              센서값은 연결되어 있지 않습니다. 현장 적합성·수용 인원·충전 여부는
              담당자가 확인한 뒤 가용 상태를 설정합니다. 안내로봇은 제안 기능의
              모의 장비입니다.
            </p>
          </section>
          <section
            id="destination-rules"
            className="staff-reference-panel staff-reference-wide"
          >
            <span className="staff-section-index">03 · DESTINATIONS</span>
            <h2>만날 곳·목적지</h2>
            <p>
              {PILOT_RULES.route}. 다른 터미널이나 보안 경계를 넘는 이동은
              직원이 정식 이용 절차를 안내합니다.
            </p>
            <p className="fine">
              아래는 시연에서 사용할 수 있는 목적지 후보입니다. 현재 접수는 만날
              곳을 저장하며, 목적지는 담당자가 상담으로 확인합니다.
            </p>
            <div className="dx-business-grid">
              {PLACES.map((p) => (
                <details className="dx-card" key={p.id}>
                  <summary>{p.label}</summary>
                  <p>
                    {p.area} · {p.landside ? "일반구역" : "보안구역"} · 담당
                    구역 {p.zoneId}
                  </p>
                  <ul>
                    {pilotDestinations(p.id).map((d) => (
                      <li key={d.id}>{d.label}</li>
                    ))}
                  </ul>
                  {pilotDestinations(p.id).length === 0 && (
                    <p>다른 등록 목적지가 없어 직원이 상담으로 확인합니다.</p>
                  )}
                </details>
              ))}
            </div>
          </section>
          <section
            id="business-rules"
            className="staff-reference-panel staff-reference-wide"
          >
            <span className="staff-section-index">04 · RESPONSIBILITIES</span>
            <h2>4개 분야·12개 사업 담당 범위</h2>
            <div className="staff-business-groups">
              {BUSINESS_GROUPS.map((g) => (
                <section key={g.id}>
                  <h3>{g.label}</h3>
                  {BUSINESS_AREAS.filter((b) => b.group === g.id).map((b) => (
                    <details className="dx-card" key={b.id}>
                      <summary>
                        {b.label} · {ACCESS_LABEL[b.access]}
                      </summary>
                      <p>
                        <strong>{b.owner}</strong> · {b.scope}
                      </p>
                      <ul>
                        {b.tasks.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </section>
              ))}
            </div>
          </section>
        </StaffReferenceTabs>
        <p className="fine">
          시연의 근무 구역은 직원 접수·처리를 위한 설정이며 실제 부서별 조직
          권한을 확정한 것은 아닙니다.{" "}
          <a href={BUSINESS_SOURCE}>공식 사업현황</a> ·{" "}
          <Link href="/services">여객용 서비스 안내</Link>
        </p>
      </main>
      <StaffNav isDesk={s.isDesk} />
    </>
  );
}
