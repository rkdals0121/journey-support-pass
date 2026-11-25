import Link from "next/link";
import { requireStaff } from "@/lib/staff-page";
import { PLACES } from "@/lib/airport";
import {
  BUSINESS_AREAS,
  BUSINESS_GROUPS,
  BUSINESS_SOURCE,
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
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("운영 기준·담당 업무");
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
            <h1>운영 기준·담당 업무</h1>
          </div>
          <div className="workspace-page-tools">
            <Link href="/staff/requests">접수·배정</Link>
            <Link href="/staff/resources">장비 현황·배차</Link>
          </div>
        </header>
        <StaffReferenceTabs
          labels={["접수·처리", "장비 가용", "거점·목적지", "담당 업무"]}
        >
          <section id="service-rules" className="staff-reference-panel">
            <h2>접수·처리 기준</h2>
            <dl className="dx-summary">
              <div>
                <dt>접수 시간 · 한국시간</dt>
                <dd>{PILOT_RULES.reception}</dd>
              </div>
              <div>
                <dt>처리 시간</dt>
                <dd>{PILOT_RULES.service}</dd>
              </div>
            </dl>
            <p>{PILOT_RULES.ownership}</p>
          </section>
          <section id="equipment-rules" className="staff-reference-panel">
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
          </section>
          <section
            id="destination-rules"
            className="staff-reference-panel staff-reference-wide"
          >
            <h2>만날 곳·목적지</h2>
            <p>
              {PILOT_RULES.route}. 다른 터미널이나 보안 경계를 넘는 이동은
              직원이 정식 이용 절차를 안내합니다.
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
          <a href={BUSINESS_SOURCE}>공식 사업현황</a> ·{" "}
          <Link href="/services">여객용 서비스 안내</Link>
        </p>
      </main>
      <StaffNav isDesk={s.isDesk} />
    </>
  );
}
