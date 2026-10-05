import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { currentSession } from "@/lib/session-server";
import { StaffList } from "./StaffList";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await currentSession();
  if (!session) redirect("/staff/login");
  return (
    <main className="page">
      <StaffList refreshSec={config.listRefreshSec} />
    </main>
  );
}
