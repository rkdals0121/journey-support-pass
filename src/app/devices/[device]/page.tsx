import { notFound } from "next/navigation";
import { DevicePreview } from "../DevicePreview";
export default async function DevicePage({
  params,
  searchParams,
}: {
  params: Promise<{ device: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ device }, q] = await Promise.all([params, searchParams]);
  if (device !== "robot" && device !== "kiosk") notFound();
  return (
    <DevicePreview
      device={device}
      initialLang={q.lang === "en" ? "en" : "ko"}
    />
  );
}
