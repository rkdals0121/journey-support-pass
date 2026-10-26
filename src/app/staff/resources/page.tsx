import Link from "next/link";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { ResourceBoard } from "./ResourceBoard";
export const dynamic = "force-dynamic";
export default async function ResourcesPage() {
  const s = await requireStaff();
  return (
    <>
      <main className="page has-nav dx-page">
        <h1>장비 현황 · 배차</h1>
        <p>
          시범 운영용 장비 대장입니다. 실제 장비와 통신하거나 출동을 지시하지
          않습니다.
        </p>
        <Link className="btn" href="/staff/requests">
          통합 요청으로 돌아가기
        </Link>
        <ResourceBoard isDesk={s.isDesk} />
        <p>
          <Link href="/staff/operations">운영 시간·구역·장비 가용 기준</Link>
        </p>
      </main>
      <StaffNav isDesk={s.isDesk} />
    </>
  );
}
