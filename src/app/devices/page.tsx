import Link from "next/link";
import { ArrowRight, Bot, Monitor, Settings2, Stethoscope } from "lucide-react";
import { PublicShell } from "../components/PublicShell";
import { Robot } from "../components/Robot";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("키오스크·안내로봇", "Kiosks and guide robots");

// 첫 화면(/)과 같은 틀: 위쪽 바와 같은 끝선의 소개 박스 아래, 같은 높이의 기기 카드 두 장.
export default async function Devices({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en",
    lang = en ? "en" : "ko",
    q = en ? "?lang=en" : "";
  const devices = [
    {
      id: "robot",
      use: "entry",
      Icon: Bot,
      place: en ? "Entrance" : "공항 입구",
      name: en ? "Guide robot" : "안내로봇",
      detail: en ? "Boarding pass → saved needs → assistance" : "탑승권 확인 → 필요한 도움 → 서비스 연결",
    },
    {
      id: "kiosk",
      use: "guide",
      Icon: Monitor,
      place: en ? "Departure area" : "출국심사 뒤",
      name: en ? "Information kiosk" : "안내 키오스크",
      detail: en ? "Gate and facility guidance, help requests" : "탑승구·편의시설 안내와 도움 요청",
    },
  ] as const;
  return (
    <PublicShell lang={lang}>
      <main id="public-main" className="task-home">
        <div className="dv-home">
          <section className="ph-hero" aria-labelledby="devices-title">
            <div className="ph-hero-copy">
              <span className="ph-hero-label">
                <Monitor aria-hidden="true" />
                {en ? "Airport devices" : "공항 현장 기기"}
              </span>
              <h1 id="devices-title">{en ? "Kiosk & guide robot" : "키오스크 · 안내로봇"}</h1>
              <p>{en ? "Preview a screen, or set up an airport device." : "화면을 미리 보거나, 현장 기기에 설치하세요."}</p>
            </div>
            <div className="ph-hero-art" aria-hidden="true">
              <span className="ph-hero-orbit" />
              <Robot mood="awake" size={176} />
            </div>
          </section>
          <div className="dv-cards">
            {devices.map(({ id, use, Icon, place, name, detail }) => (
              <article key={id} className="dv-card">
                <Icon aria-hidden="true" className="task-action-icon" strokeWidth={1.7} />
                <div className="dv-card-copy">
                  <span>{place}</span>
                  <h2>{name}</h2>
                  <p>{detail}</p>
                </div>
                <div className="dv-card-actions">
                  <Link className="btn btn-primary" href={`/devices/${id}${q}`}>
                    {en ? "Preview screen" : "화면 미리보기"}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                  <Link className="ph-text-link" href={`/kiosk?use=${use}`}>
                    <Settings2 aria-hidden="true" />
                    {en ? "Set up (staff code)" : "이 기기에 설치(직원 코드)"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
          {/* 카드 아래 빈 자리: 설치 전에 할 일(기기 점검) 안내. 넓은 화면에서는 바닥 줄까지 채운다 */}
          <aside className="dv-hint">
            <Stethoscope aria-hidden="true" className="dv-hint-icon" />
            <div>
              <p className="dv-hint-title">{en ? "Check the device before setting it up" : "설치하기 전에 기기를 점검해 보세요"}</p>
              <p>
                {en
                  ? "Test the connection, camera, voice guidance and screen sleep on the device in one place."
                  : "설치할 기기에서 인터넷 연결, 카메라, 소리 안내, 화면 꺼짐을 한 번에 확인할 수 있어요."}
              </p>
            </div>
            <Link className="btn dv-hint-action" href={"/check" + q}>
              {en ? "Check this device" : "기기 점검하기"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </main>
    </PublicShell>
  );
}
