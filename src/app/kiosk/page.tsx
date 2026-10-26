import { PLACES, placeOf } from "@/lib/airport";
import { currentSession } from "@/lib/session-server";
import { KioskSetup } from "./KioskSetup";

export const dynamic = "force-dynamic";

// 키오스크 설치. 설치 코드, 놓을 자리, 쓰임새를 정하면 그 기기가 키오스크가 된다.
export default async function KioskPage() {
  const session = await currentSession();
  const current = session?.isKiosk ? placeOf(session.placeId) : null;
  return (
    <div className="device-setup">
      <main className="page">
        <KioskSetup
          places={PLACES.map((p) => ({ id: p.id, label: p.label, landside: p.landside }))}
          currentPlace={current ? { id: current.id, label: current.label, landside: current.landside } : null}
        />
      </main>
    </div>
  );
}
