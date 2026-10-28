import Link from "next/link";
import { requireStaff } from "@/lib/staff-page";
import { VisitConsole } from "./VisitConsole";
export const dynamic = "force-dynamic";
export default async function VisitOperations() {
  const s = await requireStaff();
  return (
    <main className="page staff-console staff-visit-console">
      <header className="workspace-page-head">
        <div>
          <p className="eyebrow">현장 업무</p>
          <h1>거점 예약·현장 응대</h1>
        </div>
        <div className="workspace-page-tools">
          <Link className="btn" href="/staff/requests">
            현장 접수·배정
          </Link>
          <Link href="/staff/resources">장비 현황</Link>
        </div>
      </header>
      <VisitConsole isDesk={s.isDesk} />
    </main>
  );
}
