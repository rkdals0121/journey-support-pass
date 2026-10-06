import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session-server";
import { StaffNav } from "../../components/StaffNav";
import { ScanPanel } from "./ScanPanel";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const session = await currentSession();
  if (!session) redirect("/staff/login");
  return (
    <>
      <main className="page has-nav">
        <ScanPanel isDesk={session.isDesk} />
      </main>
      <StaffNav isDesk={session.isDesk} />
    </>
  );
}
