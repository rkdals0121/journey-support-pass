import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session-server";
import { ScanPanel } from "./ScanPanel";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const session = await currentSession();
  if (!session) redirect("/staff/login");
  return (
    <main className="page">
      <ScanPanel isDesk={session.isDesk} />
    </main>
  );
}
