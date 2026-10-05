import { config } from "@/lib/config";

export function MockBanner() {
  if (config.dataMode !== "mock") return null;
  return (
    <div className="mock-banner" role="note">
      시범 운영 · 모의 데이터
    </div>
  );
}
