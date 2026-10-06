import Link from "next/link";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { currentSession } from "@/lib/session-server";
import { StaffNav } from "../../components/StaffNav";
import { DeskFlow } from "./DeskFlow";

export const dynamic = "force-dynamic";

export default async function DeskPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const session = await currentSession();
  if (!session) redirect("/staff/login");
  if (!session.isDesk) {
    return (
      <main className="page">
        <h1>안내데스크에서만 쓸 수 있습니다</h1>
        <Link className="btn" href="/staff">
          목록으로
        </Link>
      </main>
    );
  }
  const { token } = await searchParams;
  return (
    <>
      <main className="page has-nav">
        <DeskFlow mock={config.dataMode === "mock"} scannedToken={token ?? null} />
      </main>
      <StaffNav isDesk />
    </>
  );
}
