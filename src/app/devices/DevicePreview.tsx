import Link from "next/link";
import { ArrowLeft, ArrowRight, Bot, Monitor, Settings2, Ticket } from "lucide-react";
import { PublicShell } from "../components/PublicShell";
import { TaskLauncher } from "../components/TaskLauncher";
import { Robot } from "../components/Robot";

// 기기 화면 미리보기. 첫 화면(/)과 같은 틀: 소개 박스(기기 이름·질문) 아래 서비스 카드.
// 서비스를 누르면 실제 웹앱으로 이어진다. 언어·글자 크기는 위쪽 바에 있다.
export function DevicePreview({ device, lang }: { device: "robot" | "kiosk"; lang: "ko" | "en" }) {
  const en = lang === "en",
    robot = device === "robot",
    q = en ? "?lang=en" : "";
  const Icon = robot ? Bot : Monitor;
  return (
    <PublicShell lang={lang}>
      <main id="public-main" className="task-home">
        <div className={"dv-home dv-preview" + (robot ? " dv-preview-robot" : "")}>
          <section className="ph-hero" aria-labelledby="preview-title">
            <div className="ph-hero-copy">
              <span className="ph-hero-label">
                <Icon aria-hidden="true" />
                {robot ? (en ? "Guide robot" : "안내로봇") : en ? "Information kiosk" : "안내 키오스크"}
                {en ? " · screen preview" : " · 화면 미리보기"}
              </span>
              <h1 id="preview-title">{en ? "What would you like to do?" : "어떤 서비스를 이용하시겠어요?"}</h1>
              <p className="dv-hero-links">
                <Link className="ph-text-link" href={"/devices" + q}>
                  <ArrowLeft aria-hidden="true" />
                  {en ? "Device list" : "기기 목록"}
                </Link>
                <Link className="ph-text-link" href={"/kiosk?use=" + (robot ? "entry" : "guide")}>
                  <Settings2 aria-hidden="true" />
                  {en ? "Install on a device" : "현장 기기에 설치"}
                </Link>
              </p>
            </div>
            {robot && (
              <div className="ph-hero-art" aria-hidden="true">
                <span className="ph-hero-orbit" />
                <Robot mood="awake" size={176} />
              </div>
            )}
          </section>
          <div className="ph-list">
            <TaskLauncher en={en} device={device} topics={robot ? ["guidance", "mobility"] : undefined} />
            <article className="task-action task-action-booking">
              <Ticket aria-hidden="true" className="task-action-icon" strokeWidth={1.7} />
              <Link className="task-action-link" href={"/prepare/booking" + q}>
                <span>
                  <strong>{en ? "Retrieve flight information" : "예약정보로 항공편 불러오기"}</strong>
                  <small>{en ? "Demo booking lookup" : "시연 예약 조회"}</small>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </article>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
