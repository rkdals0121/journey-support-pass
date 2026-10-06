import { Lock } from "lucide-react";
import Link from "next/link";
import { config } from "@/lib/config";
import { requireStaff } from "@/lib/staff-page";
import { StaffNav } from "../../components/StaffNav";
import { DeskFlow } from "./DeskFlow";

export const dynamic = "force-dynamic";

export default async function DeskPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const session = await requireStaff();
  if (!session.isDesk) {
    return (
      <>
        <main className="page has-nav">
          <div className="empty">
            <span className="bubble">
              <Lock size={26} aria-hidden="true" />
            </span>
            <strong>안내데스크에서만 쓸 수 있습니다</strong>
            <p>패스 연결과 등록은 안내데스크 코드로 로그인해야 쓸 수 있습니다.</p>
          </div>
          <Link className="btn" href="/staff">
            여객 목록으로
          </Link>
        </main>
        <StaffNav isDesk={false} />
      </>
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
