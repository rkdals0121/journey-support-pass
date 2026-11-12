import { PublicShell } from "../components/PublicShell";
import { DeviceCheck } from "./DeviceCheck";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("기기 점검", "Device check");

// 기기 점검. 키오스크로 쓸 태블릿이나 여객 역할 휴대전화에서 카메라, 소리, 인터넷 같은 것이 되는지 한 화면에서 본다.
// 여객 정보나 접속 코드는 다루지 않으므로 누구나 열 수 있다.
export default async function CheckPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = (await searchParams).lang === "en" ? "en" : "ko";
  return (
    <PublicShell lang={lang}>
      <main id="public-main" className="service-page service-short-page" lang={lang}>
        <DeviceCheck key={lang} lang={lang} />
      </main>
    </PublicShell>
  );
}
