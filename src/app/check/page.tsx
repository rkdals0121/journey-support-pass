import type { Metadata } from "next";
import { DeviceCheck } from "./DeviceCheck";

export const metadata: Metadata = { title: "기기 점검 · Journey Support Pass" };

// 기기 점검. 키오스크로 쓸 태블릿이나 여객 역할 휴대전화에서 카메라, 소리, 인터넷 같은 것이 되는지 한 화면에서 본다.
// 여객 정보나 접속 코드는 다루지 않으므로 누구나 열 수 있다.
export default function CheckPage() {
  return (
    <main className="page">
      <DeviceCheck />
    </main>
  );
}
