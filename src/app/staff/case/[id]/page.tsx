import { config } from "@/lib/config";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../../components/StaffNav";
import { CaseCard } from "./CaseCard";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaff();
  return (
    <>
      <main className="page has-nav has-cta">
        <CaseCard id={id} timeoutSec={config.cardTimeoutSec} />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
