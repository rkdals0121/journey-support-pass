"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export function TrafficEntry({
  en,
  info,
  onInfo,
  onDispatch,
  onBack,
}: {
  en: boolean;
  info: boolean;
  onInfo: () => void;
  onDispatch: () => void;
  onBack: () => void;
}) {
  return (
    <main id="public-main" className="booking-lookup traffic-entry">
      {/* 모든 화면 같은 자리의 「이전」. 안내 화면이면 고르는 화면으로, 고르는 화면이면 앞 화면으로. */}
      <button
        type="button"
        className="request-back"
        onClick={() => {
          if (info) onBack();
          else if (window.history.length > 1) window.history.back();
          else window.location.assign("/services" + (en ? "?lang=en" : ""));
        }}
      >
        <ArrowLeft aria-hidden="true" />
        {en ? "Back" : "이전"}
      </button>
      <h1>{en ? "Transport and parking" : "교통·주차 지원"}</h1>
      {!info ? (
        <div className="traffic-intent-options">
          <button
            type="button"
            className="traffic-intent"
            data-traffic-intent="dispatch"
            onClick={onDispatch}
          >
            <strong>
              {en ? "I need help on site" : "직원이 와서 도와주세요"}
            </strong>
            <span>
              {en
                ? "Parking, taxi boarding, bus or shuttle assistance"
                : "주차장 현장 지원 · 택시 승차 · 버스·셔틀 이용 도움"}
            </span>
          </button>
          <button
            type="button"
            className="traffic-intent"
            data-traffic-intent="info"
            onClick={onInfo}
          >
            <strong>
              {en ? "I only need information" : "이용 방법만 알고 싶어요"}
            </strong>
            <span>
              {en
                ? "Routes, stops, parking and fares"
                : "노선·승차장·주차 위치·요금 안내"}
            </span>
          </button>
        </div>
      ) : (
        <section className="traffic-information">
          <h2>{en ? "Transport information" : "교통 이용 안내"}</h2>
          <p>
            <a
              href="https://www.airport.kr/ap_ko/957/subview.do"
              target="_blank"
              rel="noreferrer"
            >
              {en ? "Official parking guide ↗" : "공식 주차장 안내 ↗"}
            </a>
          </p>
          <p>
            <a
              href="https://www.airport.kr/ap_ko/989/subview.do"
              target="_blank"
              rel="noreferrer"
            >
              {en
                ? "Official airport shuttle guide ↗"
                : "공식 공항 셔틀버스 안내 ↗"}
            </a>
          </p>
          <p>
            <a href="tel:15772600">
              {en
                ? "Airport information: 1577-2600"
                : "공항 고객센터 1577-2600"}
            </a>
          </p>
          <p>
            <a href="tel:0327417700">
              {en
                ? "Terminal 1 parking office: 032-741-7700"
                : "제1터미널 주차상황실 032-741-7700"}
            </a>
          </p>
          <p>
            <a href="tel:0327410260">
              {en
                ? "Terminal 2 parking office: 032-741-0260"
                : "제2터미널 주차상황실 032-741-0260"}
            </a>
          </p>
          <Link href={"/services/desks" + (en ? "?lang=en" : "")}>
            {en ? "Information desk locations" : "안내데스크 위치 보기"}
          </Link>
          <div className="booking-actions">
            <button className="booking-sample" type="button" onClick={onBack}>
              {en ? "Back" : "이전"}
            </button>
            <button
              className="public-button"
              type="button"
              onClick={onDispatch}
            >
              {en ? "Request on-site help instead" : "현장 지원 요청하기"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
