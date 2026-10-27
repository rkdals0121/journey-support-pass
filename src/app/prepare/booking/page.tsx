import { config } from "@/lib/config";
import { BookingLookup } from "./BookingLookup";
export const dynamic = "force-dynamic";
export default async function BookingPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const en = (await searchParams).lang === "en";
  return <BookingLookup lang={en ? "en" : "ko"} enabled={config.dataMode === "mock"} />;
}
