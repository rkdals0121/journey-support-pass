import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { currentSession } from "@/lib/session-server";
import { CaseCard } from "./CaseCard";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await currentSession();
  if (!session) redirect("/staff/login");
  return (
    <main className="page">
      <CaseCard id={id} timeoutSec={config.cardTimeoutSec} />
    </main>
  );
}
