import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { todaySummary, type Completion } from "@/lib/metrics";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../../components/StaffNav";

export const dynamic = "force-dynamic";

function duration(sec: number | null): string {
  if (sec === null) return "–";
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

// 안내데스크의 오늘 현황. 제안서의 "기대 효과와 확인 방법" 세 가지를 그대로 보여준다. 건수와 가운데값뿐이다.
export default async function DeskStatsPage() {
  const session = await requireStaff();
  if (!session.isDesk) redirect("/staff");
  const s = await todaySummary(await getDb(), new Date());
  const [, month, day] = s.date.split("-");
  const pct = (n: number) => (s.survey.total === 0 ? 0 : Math.round((n / s.survey.total) * 100));

  return (
    <>
      <main className="page has-nav">
        <h1>
          오늘 현황{" "}
          <span className="h1-sub">
            {Number(month)}월 {Number(day)}일
          </span>
        </h1>
        <div className="stat-grid">
          <Stat label="지금 패스를 쓰는 여객" value={`${s.active}`} unit="명" />
          <Stat label="오늘 받은 등록" value={`${s.registered}`} unit="건" />
        </div>
        <p className="hint">
          휴대전화 {s.byRoute.web}건 · 키오스크 {s.byRoute.kiosk}건 · 직원이 대신 입력 {s.byRoute.assisted}건
        </p>

        <h2>1. 자신에게 맞는 안내를 받는다</h2>
        <div className="stat-grid">
          <Stat label="안내 화면을 연 횟수" value={`${s.guideOpens}`} unit="회" />
          <Stat label="만족도 응답" value={`${s.survey.total}`} unit="건" />
        </div>
        <div className="bar3" role="img" aria-label={`도움이 됐어요 ${s.survey.good}건, 보통이에요 ${s.survey.fair}건, 도움이 안 됐어요 ${s.survey.poor}건`}>
          <i className="good" style={{ flexGrow: s.survey.good }} />
          <i className="fair" style={{ flexGrow: s.survey.fair }} />
          <i className="poor" style={{ flexGrow: s.survey.poor }} />
        </div>
        <p className="hint">
          도움이 됐어요 {s.survey.good}건({pct(s.survey.good)}%) · 보통이에요 {s.survey.fair}건 · 도움이 안 됐어요 {s.survey.poor}건
        </p>

        <h2>2. 기기를 쓰기 어렵던 여객도 스스로 이용한다</h2>
        <div className="stat-grid">
          <Rate label="안내 방식을 켠 여객의 등록 완료" c={s.completion.adapted} />
          <Rate label="켜지 않은 여객의 등록 완료" c={s.completion.plain} />
          <Stat label="등록 작성 시간 (가운데값)" value={duration(s.medianWriteSec)} />
        </div>
        <p className="hint">안내 방식은 큰 글씨, 소리, 글과 그림, 쉬운 말입니다. 첫 질문을 넘긴 여객 가운데 등록을 마친 비율입니다.</p>

        <h2>3. 직원의 업무 부담을 늘리지 않는다</h2>
        <div className="stat-grid">
          <Stat label="「직원 부르기」를 누른 횟수" value={`${s.calls.total}`} unit="회" />
          <Stat label="직원이 대신 입력한 등록" value={`${s.byRoute.assisted}`} unit="건" />
          <Stat label="누른 뒤 직원이 받기까지 (가운데값)" value={duration(s.calls.medianAcceptSec)} />
          <Stat label="지금 열려 있는 호출" value={`${s.calls.open}`} unit="건" />
        </div>
        <p className="hint">
          등록하다가 {s.calls.fromRegister}회 · 안내를 보다가 {s.calls.fromGuide}회 · 도움 마침 {s.calls.done}회 · 여객이 거둠{" "}
          {s.calls.cancelled}회 · 응답 없이 닫힘 {s.calls.expired}회
        </p>
        <p className="fine">건수와 시간만 셉니다. 항공편이나 여객이 고른 항목은 여기에 쓰이지 않습니다.</p>
      </main>
      <StaffNav isDesk />
    </>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>
        {value}
        {unit && <small>{unit}</small>}
      </b>
    </div>
  );
}

function Rate({ label, c }: { label: string; c: Completion }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>
        {c.rate === null ? "–" : c.rate}
        {c.rate !== null && <small>%</small>}
      </b>
      <em>
        시작 {c.started}명 · 완료 {c.done}명
      </em>
    </div>
  );
}
