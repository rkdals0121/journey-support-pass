import Link from "next/link";
import { ArrowRight, Bot, Monitor, Settings2 } from "lucide-react";
import { PublicShell } from "../components/PublicShell";
import { Robot } from "../components/Robot";

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
        </div>
      </main>
    </PublicShell>
  );
}
