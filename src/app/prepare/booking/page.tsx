import { config } from "@/lib/config";
import { BookingLookup } from "./BookingLookup";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("예약번호로 항공편 찾기", "Find your flight by booking number");
export const dynamic = "force-dynamic";
export default async function BookingPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const en = (await searchParams).lang === "en";
  return <BookingLookup lang={en ? "en" : "ko"} enabled={config.dataMode === "mock"} />;
}
