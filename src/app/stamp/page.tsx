import type { Metadata } from "next";
import { StampBook } from "./StampBook";

export const metadata: Metadata = { title: "공항 스탬프북", description: "공항 체크포인트에서 QR 도장을 모으는 가족 여행객 전자 스탬프북" };

export default function Page() {
  return <StampBook />;
}
