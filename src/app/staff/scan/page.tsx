import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { ScanPanel } from "./ScanPanel";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav">
        <ScanPanel isDesk={session.isDesk} />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
