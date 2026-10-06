import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session-server";
import { ZonePicker } from "./ZonePicker";

export const dynamic = "force-dynamic";

// 공통 직원 코드로 들어온 사람이 근무 구역을 고르는 화면. 근무 중에 구역을 옮길 때도 여기서 바꾼다.
export default async function ZonePage() {
  const session = await currentSession();
  if (!session) redirect("/staff/login");
  if (!session.canSwitch) redirect("/staff");
  return (
    <main className="page">
      <ZonePicker first={session.needsZone} />
    </main>
  );
}
