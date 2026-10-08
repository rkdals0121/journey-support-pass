import { CircleSlash, Link2Off, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { decideTokenPage } from "@/lib/api/staff";
import { getDb } from "@/lib/db";
import { currentSession, requestDeviceKey } from "@/lib/session-server";
import { Brand } from "../../components/Sunflower";

export const dynamic = "force-dynamic";

// 패스 QR 이 가리키는 주소. 휴대전화 기본 카메라로 찍으면 여기로 온다.
export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const now = new Date();
  const session = await currentSession(now);
  const here = encodeURIComponent(`/p/${token}`);

  // 로그인하지 않은 사람에게는 DB 를 열지 않는다.
  const page = session
    ? await decideTokenPage(await getDb(), token, session, await requestDeviceKey(), now)
    : ({ kind: "staff_only" } as const);

  if (page.kind === "pick_zone") redirect(`/staff/zone?next=${here}`);
  if (page.kind === "case") redirect(`/staff/case/${page.registrationId}`);

  if (page.kind === "staff_only") {
    return (
      <main className="page">
        <Brand />
        <div className="empty">
          <span className="bubble">
            <ShieldCheck size={26} aria-hidden="true" />
          </span>
          <strong>공항 직원 전용 QR입니다</strong>
          <p>
            이 QR은 공항 직원이 교통약자 여객을 안내할 때 씁니다. 여객 정보는 직원만 볼 수 있습니다. 패스를
            주우셨다면 가까운 안내데스크에 맡겨 주세요.
          </p>
        </div>
        <Link className="btn btn-primary" href={`/staff/login?next=${here}`}>
          직원 로그인
        </Link>
      </main>
    );
  }

  // 여객에게 연결되지 않은 패스. 지금은 등록할 때 패스가 바로 만들어지므로 예전에 미리 만들어 둔 패스에서만 나온다.
  const idle = page.kind === "idle" || page.kind === "desk_link";
  return (
    <main className="page">
      <Brand />
      <div className="empty">
        <span className="bubble bubble-sun">
          {idle ? <Link2Off size={26} aria-hidden="true" /> : <CircleSlash size={26} aria-hidden="true" />}
        </span>
        <strong>{idle ? "연결되지 않은 패스입니다" : "사용할 수 없는 패스입니다"}</strong>
        <p>
          {idle
            ? "여객 등록과 연결되지 않은 패스입니다. 여객의 등록 완료 화면에 있는 QR을 찍어 주세요."
            : "만료되었거나 분실 처리된 패스입니다. 여객에게 구두로 확인해 주세요."}
        </p>
      </div>
      <Link className="btn" href="/staff">
        여객 목록으로
      </Link>
    </main>
  );
}
