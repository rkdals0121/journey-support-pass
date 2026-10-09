import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { requireStaff } from "@/lib/staff-page";
import { RegisterKiosk } from "../../../kiosk/register/RegisterKiosk";

export const dynamic = "force-dynamic";

// 안내데스크 직원이 여객 대신 등록한다. 여객이 보는 것과 같은 질문을 같은 순서로 쓴다.
export default async function DeskRegisterPage() {
  const session = await requireStaff();
  if (!session.isDesk) redirect("/staff");
  return (
    <RegisterKiosk
      assisted
      placeLabel="안내데스크"
      placeLabelEn="Information desk"
      idleAskSec={config.idleAskSec}
      idleAnswerSec={config.idleAnswerSec}
    />
  );
}
