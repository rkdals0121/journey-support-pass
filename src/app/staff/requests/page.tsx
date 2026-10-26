import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { RequestList } from "./RequestList";
import { StaffSessionControls } from "./StaffSessionControls";
import Link from "next/link";
import { businessOf } from "@/lib/operating-profile";
import { UNCLASSIFIED_BUSINESS } from "@/lib/business-overview-model";
export const dynamic = "force-dynamic";
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const s = await requireStaff();
  const q = await searchParams;
  const business =
    typeof q.business === "string" &&
    (q.business === UNCLASSIFIED_BUSINESS || businessOf(q.business))
      ? q.business
      : "all";
  const scope =
    typeof q.scope === "string" &&
    ["all", "active", "waiting", "mine", "location", "attention"].includes(
      q.scope,
    )
      ? q.scope
      : "all";
  return (
    <>
      <main className="page has-nav dx-page">
        <div className="workspace-page-head">
          <div>
            <h1>통합 요청</h1>
          </div>
          <div className="workspace-page-tools">
            {s.isDesk && (
              <Link className="btn btn-primary" href="/staff/requests/new">
                여객 대신 접수
              </Link>
            )}
            <StaffSessionControls canSwitch={s.canSwitch} />
            <Link href="/staff/operations">운영 기준</Link>
          </div>
        </div>
        <RequestList
          key={`${business}-${scope}`}
          zoneId={s.zoneId}
          isDesk={s.isDesk}
          initialBusiness={business}
          initialScope={scope}
        />
      </main>
      <StaffNav isDesk={s.isDesk} />
    </>
  );
}
