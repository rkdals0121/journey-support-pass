import Link from "next/link";
import { redirect } from "next/navigation";
import { decideTokenPage } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import { currentSession, requestDeviceKey } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// 패스 QR 이 가리키는 주소. 휴대전화 기본 카메라로 찍으면 여기로 온다.
export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const now = new Date();
  const session = await currentSession(now);

  // 로그인하지 않은 사람에게는 DB 를 열지 않는다.
  const page = session
    ? await decideTokenPage(await getDb(), token, session, await requestDeviceKey(), now)
    : ({ kind: "staff_only" } as const);

  if (page.kind === "case") redirect(`/staff/case/${page.registrationId}`);
  if (page.kind === "desk_link") redirect(`/staff/desk?token=${page.token}`);

  if (page.kind === "staff_only") {
    return (
      <main className="page">
        <h1>직원 전용 화면입니다</h1>
        <p className="muted">
          이 QR은 공항 직원이 교통약자 여객을 안내할 때 쓰는 것입니다. 패스를 주우셨다면 가까운 안내데스크에 맡겨
          주세요.
        </p>
        <Link className="btn" href={`/staff/login?next=${encodeURIComponent(`/p/${token}`)}`}>
          직원 로그인
        </Link>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>{page.kind === "idle" ? "연결되지 않은 패스입니다" : "사용할 수 없는 패스입니다"}</h1>
      <p className="muted">
        {page.kind === "idle"
          ? "안내데스크에서 여객 등록과 연결한 뒤에 쓸 수 있습니다."
          : "만료되었거나 분실 처리된 패스입니다. 구두로 확인해 주세요."}
      </p>
      <Link className="btn" href="/staff">
        목록으로
      </Link>
    </main>
  );
}
