"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Accessibility,
  MapPin,
  QrCode,
  Navigation,
  RotateCcw,
} from "lucide-react";
import { Robot } from "../components/Robot";
import { Sunflower } from "../components/Sunflower";

export function DevicePreview({
  device,
  initialLang,
}: {
  device: "robot" | "kiosk";
  initialLang: "ko" | "en";
}) {
  const [lang, setLang] = useState(initialLang),
    [screen, setScreen] = useState("welcome");
  const en = lang === "en",
    robot = device === "robot",
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [screen]);
  const t = (ko: string, enText: string) => (en ? enText : ko);
  return (
    <main className="device-preview" lang={lang}>
      <div className="device-preview-status">
        <Link href={"/devices" + (en ? "?lang=en" : "")}>
          <ArrowLeft aria-hidden="true" />
          {t("기기 목록", "Devices")}
        </Link>
        <span>
          {t(
            "화면 미리보기 · 실제 접수 없음",
            "Screen preview · no requests submitted",
          )}
        </span>
      </div>
      <header className="device-preview-header">
        <span className="device-brand">
          <Sunflower />
          분(分)실
        </span>
        <span>
          {robot
            ? t("안내로봇", "Guide robot")
            : t("안내 키오스크", "Information kiosk")}
        </span>
        <button type="button" onClick={() => setLang(en ? "ko" : "en")}>
          {en ? "한국어" : "English"}
        </button>
      </header>
      <section className="device-preview-body">
        {screen === "welcome" ? (
          <div className="device-welcome">
            <div className="device-welcome-copy">
              <span className="public-eyebrow">
                {t("공항 이용, 조금 더 편안하게", "A MORE COMFORTABLE JOURNEY")}
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {t("어떤 도움이", "How can we")}
                <br />
                {t("필요하세요?", "help you?")}
              </h1>
              <p>
                {t(
                  "탑승권으로 나에게 맞는 안내를 시작하세요.",
                  "Start personalised guidance with your boarding pass.",
                )}
              </p>
              <button
                className="public-button"
                onClick={() => setScreen("services")}
              >
                {t("화면 시작", "Start preview")}
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
            <div className="device-welcome-visual">
              {robot ? (
                <Robot mood="happy" size={360} />
              ) : (
                <QrCode size={180} aria-hidden="true" />
              )}
              <span>
                {t("탑승권 · 지원 패스", "Boarding pass · Support pass")}
              </span>
            </div>
          </div>
        ) : screen === "services" ? (
          <>
            <div className="device-step-heading">
              <span className="public-eyebrow">
                {t("맞춤 서비스", "YOUR SERVICES")}
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {t("필요한 서비스를 선택하세요", "Choose a service")}
              </h1>
            </div>
            <div className="device-service-choices">
              {[
                [
                  "guidance",
                  Navigation,
                  t("탑승구·시설 안내", "Gate & facilities"),
                ],
                [
                  "support",
                  Accessibility,
                  t("이동 도움 요청", "Mobility assistance"),
                ],
                ["needs", QrCode, t("필요한 도움 확인", "Review saved needs")],
              ].map(([id, Icon, label]) => {
                const I = Icon as typeof Navigation;
                return (
                  <button
                    key={String(id)}
                    onClick={() => setScreen(String(id))}
                  >
                    <I aria-hidden="true" />
                    <span>{String(label)}</span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="device-detail-preview">
            <span className="public-eyebrow">
              {t("예시 화면", "EXAMPLE SCREEN")}
            </span>
            <h1 ref={heading} tabIndex={-1}>
              {screen === "guidance"
                ? t("탑승구까지 편안한 길", "An accessible route to your gate")
                : screen === "support"
                  ? t("직원과 만날 곳", "Your meeting point")
                  : t("나에게 필요한 도움", "Your saved needs")}
            </h1>
            <div className="device-example-card">
              <MapPin aria-hidden="true" />
              <h2>
                {screen === "guidance"
                  ? t("130번 탑승구", "Gate 130")
                  : screen === "support"
                    ? t("현재 기기 위치에서 만나기", "Meet at this device")
                    : t("계단 없는 이동", "Step-free access")}
              </h2>
              <p>
                {screen === "guidance"
                  ? t(
                      "현재 위치 → 엘리베이터 → 탑승구",
                      "Current location → lift → gate",
                    )
                  : screen === "support"
                    ? t(
                        "설치된 기기의 위치가 만날 곳으로 연결됩니다.",
                        "The installed device provides the meeting point.",
                      )
                    : t(
                        "등록한 도움을 확인하고 변경할 수 있어요.",
                        "Review and change your saved needs.",
                      )}
              </p>
            </div>
            <p className="public-caption">
              {t(
                "미리보기 예시입니다. 탑승권 확인·접수는 설치된 기기에서 이용하세요.",
                "Preview example. Use an installed device for boarding pass checks and requests.",
              )}
            </p>
            <button
              className="public-button public-button-secondary"
              onClick={() => setScreen("services")}
            >
              <ArrowLeft aria-hidden="true" />
              {t("서비스 선택", "Choose a service")}
            </button>
          </div>
        )}
      </section>
      <footer className="device-preview-footer">
        <button type="button" onClick={() => setScreen("welcome")}>
          <RotateCcw aria-hidden="true" />
          {t("처음 화면", "Start screen")}
        </button>
        <Link href={"/kiosk?use=" + (robot ? "entry" : "guide")}>
          {t("현장 기기에 설치", "Set up airport device")}
          <ArrowRight aria-hidden="true" />
        </Link>
      </footer>
    </main>
  );
}
