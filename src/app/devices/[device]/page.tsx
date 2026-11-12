import { notFound } from "next/navigation";
import { DevicePreview } from "../DevicePreview";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("기기 화면 미리보기", "Device screen preview");
export default async function DevicePage({
  params,
  searchParams,
}: {
  params: Promise<{ device: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ device }, q] = await Promise.all([params, searchParams]);
  if (device !== "robot" && device !== "kiosk") notFound();
  return <DevicePreview device={device} lang={q.lang === "en" ? "en" : "ko"} />;
}
