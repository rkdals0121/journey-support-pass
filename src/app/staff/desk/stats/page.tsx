import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { todaySummary } from "@/lib/metrics";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../../components/StaffNav";

export const dynamic = "force-dynamic";

function duration(sec: number | null): string {
  if (sec === null) return "-";
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

// 안내데스크의 오늘 현황. 건수와 가운데값만 보여준다. 이름이나 편명은 없다.
export default async function DeskStatsPage() {
  const session = await requireStaff();
  if (!session.isDesk) redirect("/staff");
  const s = await todaySummary(await getDb(), new Date());
  const [, month, day] = s.date.split("-");

  return (
    <>
      <main className="page has-nav">
        <div className="topbar">
          <Link className="icon-btn" href="/staff/desk" aria-label="안내데스크로">
            <ChevronLeft size={26} aria-hidden="true" />
          </Link>
          <span className="topbar-title">안내데스크</span>
        </div>
        <h1>
          오늘 현황 <span className="muted" style={{ fontSize: 17, fontWeight: 600 }}>{Number(month)}월 {Number(day)}일</span>
        </h1>

        <h2 className="section-title">지금</h2>
        <div className="stat-grid">
          <Stat label="패스를 기다리는 등록" value={`${s.waiting}`} unit="건" />
          <Stat label="패스를 쓰고 있는 여객" value={`${s.active}`} unit="명" />
        </div>

        <h2 className="section-title">등록</h2>
        <div className="stat-grid">
          <Stat label="오늘 받은 등록" value={`${s.registered}`} unit="건" />
          <Stat label="패스까지 연결" value={`${s.linked}`} unit="건" />
          <Stat label="작성 시간 (가운데값)" value={duration(s.medianWriteSec)} />
          <Stat label="등록부터 패스 연결까지" value={duration(s.medianLinkWaitSec)} />
        </div>
        <p className="hint">
          휴대전화 {s.byRoute.web}건 · 직원이 물어보며 입력 {s.byRoute.assisted}건 · 종이 체크리스트 {s.byRoute.paper}건
        </p>

        <h2 className="section-title">현장 응대</h2>
        <div className="stat-grid">
          <Stat label="여객 카드를 연 횟수" value={`${s.scans}`} unit="회" />
          <Stat label="응대 완료" value={`${s.completed}`} unit="회" />
          <Stat label="카드를 열고 응대 시작까지" value={duration(s.medianScanToStartSec)} />
          <Stat label="응대 시간 (가운데값)" value={duration(s.medianServiceSec)} />
          <Stat label="구역을 이어서 응대한 여객 (출발 전)" value={`${s.handoffs}`} unit="명" />
        </div>
        <p className="hint">
          건수와 시간만 셉니다. 이름·편명·필요한 도움은 여기에 쓰이지 않습니다. 자세한 값은 운영자가 CSV로 내려받습니다.
        </p>
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
