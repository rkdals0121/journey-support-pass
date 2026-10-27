import type { Metadata } from "next";
import { StampBook } from "../../StampBook";

export const metadata: Metadata = { title: "공항 스탬프북" };

// 체크포인트 QR 의 주소. 휴대전화 기본 카메라로 찍어도 스탬프북이 열리고 도장이 찍힌다.
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <StampBook scanned={code} />;
}
