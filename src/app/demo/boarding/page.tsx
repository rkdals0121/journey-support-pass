import type { Metadata } from "next";
import { BoardingDemo } from "./BoardingDemo";

export const metadata: Metadata = { title: "모의 탑승권 (시연)" };

// 미리 등록하지 않은 여객의 탑승권을 흉내 내는 시연용 화면. 공항 입구 안내로봇에 찍어 그 자리에서 등록하는 장면에 쓴다.
// 서버에 아무것도 남기지 않는다(탑승권 번호는 이 화면에서 만든다).
export default function BoardingDemoPage() {
  return <BoardingDemo />;
}
