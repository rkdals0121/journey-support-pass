"use client";

import { useEffect, useState } from "react";
import { ViewSwitch } from "./ViewSwitch";

// 안내로봇의 실제 해상도(세로 1080×1920). 기기가 정해 둔 값이라 인라인 숫자로 둔다.
const ROBOT_W = 1080;
const ROBOT_H = 1920;

/**
 * 「실제 키오스크 버전」: 로봇 화면을 기기 크기 그대로 틀에 넣고 PC 창에 통째로 들어오게 줄여 보여 준다.
 * 스크롤이 없고, 로봇 화면에 넣을 때와 같은 모습이다. 안의 화면은 진짜 /kiosk/entry 라서 고치면 같이 바뀐다.
 */
export function RobotStage({ lang }: { lang: "ko" | "en" }) {
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const fit = () => setScale(Math.max(0.1, Math.min(window.innerWidth / ROBOT_W, window.innerHeight / ROBOT_H)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="robot-stage">
      {/* 로봇 화면 안에는 시연용 버튼을 넣지 않는다(기기와 똑같이 보이게). 전환 버튼은 틀 바깥에 둔다. */}
      <div className="robot-stage-bar"><ViewSwitch mode="device" lang={lang} /></div>
      {scale > 0 && (
        <div className="robot-stage-screen" style={{ width: ROBOT_W * scale, height: ROBOT_H * scale }}>
          <iframe
            title={lang === "en" ? "Guide robot screen" : "안내로봇 화면"}
            src={`/kiosk/entry?inner=1${lang === "en" ? "&lang=en" : ""}`}
            allow="camera; microphone"
            style={{ width: ROBOT_W, height: ROBOT_H, transform: `scale(${scale})` }}
          />
        </div>
      )}
    </div>
  );
}
