import { demoCodes } from "@/lib/demo-codes";
import { StaffLogin } from "./StaffLogin";

// 시연 코드 단추를 켜고 끄는 환경 변수(DEMO_CODE_FILL)를 요청 때마다 읽는다.
export const dynamic = "force-dynamic";

export default function StaffLoginPage() {
  return <StaffLogin demoCode={demoCodes().staff} />;
}
