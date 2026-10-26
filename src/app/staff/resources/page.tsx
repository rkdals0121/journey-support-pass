import Link from "next/link";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { ResourceBoard } from "./ResourceBoard";
export const dynamic = "force-dynamic";
export default async function ResourcesPage() {
  const s = await requireStaff();
  return (
    <>
      <main className="page has-nav dx-page resource-console">
        <div className="workspace-page-head">
          <div>
            <p className="eyebrow">지원 운영</p>
            <h1>장비 현황·배차</h1>
          </div>
          <span className="integration-mode">
            시범 장비 대장 · 실물 통신 미연결
          </span>
        </div>
        <ResourceBoard isDesk={s.isDesk} />
        <p>
          <Link href="/staff/operations">운영 시간·구역·장비 가용 기준</Link>
        </p>
      </main>
      <StaffNav isDesk={s.isDesk} />
    </>
  );
}
