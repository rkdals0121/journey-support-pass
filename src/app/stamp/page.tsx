import type { Metadata } from "next";
import { StampBook } from "./StampBook";
import { pageTitle } from "@/lib/page-title";

const title = pageTitle("공항 스탬프북", "Airport stamp book");
// 탭 제목은 다른 화면처럼 「… · Journey Support Pass」, ?lang=en 이면 영어로.
export async function generateMetadata(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const en = (await props.searchParams)?.lang === "en";
  return {
    ...(await title(props)),
    description: en ? "A family stamp book: collect QR stamps at airport checkpoints" : "공항 체크포인트에서 QR 도장을 모으는 가족 여행객 전자 스탬프북",
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  return <StampBook lang={(await searchParams).lang === "en" ? "en" : "ko"} />;
}
