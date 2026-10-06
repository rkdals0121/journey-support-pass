import { config } from "@/lib/config";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../components/StaffNav";
import { StaffList } from "./StaffList";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav">
        <StaffList refreshSec={config.listRefreshSec} />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
