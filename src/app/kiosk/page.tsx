import Image from "next/image";
import { PLACES, placeOf } from "@/lib/airport";
import { currentSession } from "@/lib/session-server";
import { KioskSetup } from "./KioskSetup";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("키오스크 설치");

export const dynamic = "force-dynamic";

// 키오스크 설치. 설치 코드, 놓을 자리, 쓰임새를 정하면 그 기기가 키오스크가 된다.
export default async function KioskPage() {
  const session = await currentSession();
  const current = session?.isKiosk ? placeOf(session.placeId) : null;
  return (
    <div className="device-setup">
      {/* 넓은 화면(키오스크·노트북)에서는 왼쪽에 나랑이 안내 칸, 오른쪽에 설치 칸. 큰 화면 가운데 작은 상자만 있던 것 */}
      <aside className="setup-art" aria-hidden="true">
        <p>
          설치를 마치면
          <br />
          제가 여기서 여객을 맞이할게요!
        </p>
        <Image src="/images/haneuli/narangi.webp" alt="" width={1280} height={1280} sizes="(max-width: 1100px) 1px, 320px" priority />
      </aside>
      <main className="page">
        <KioskSetup
          places={PLACES.map((p) => ({ id: p.id, label: p.label, landside: p.landside }))}
          currentPlace={current ? { id: current.id, label: current.label, landside: current.landside } : null}
        />
      </main>
    </div>
  );
}
