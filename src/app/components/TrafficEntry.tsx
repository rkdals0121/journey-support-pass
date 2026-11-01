"use client";
import Link from "next/link";
import { ArrowLeft, Bus, CarFront, UserRound } from "lucide-react";
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
    <main id="public-main" className="request-experience traffic-entry">
      {/* 현장 도움 요청과 같은 소개 박스. 모든 화면 같은 자리의 「이전」: 안내 화면이면 고르는 화면으로, 고르는 화면이면 앞 화면으로. */}
      <header className="ph-hero request-heading">
        <div className="ph-hero-copy">
          <div className="request-hero-top">
            <button
              type="button"
              className="request-back"
              onClick={() => {
                if (info) onBack();
                else if (window.history.length > 1) window.history.back();
                else
                  window.location.assign("/services" + (en ? "?lang=en" : ""));
              }}
            >
              <ArrowLeft aria-hidden="true" />
              {en ? "Back" : "이전"}
            </button>
            <span className="service-kicker">
              <CarFront aria-hidden="true" />
              {en ? "AIRPORT SERVICES" : "공항 현장 서비스"}
            </span>
          </div>
          <h1>{en ? "Transport and parking" : "교통·주차 지원"}</h1>
          <p>
            {info
              ? en
                ? "Official guides and phone numbers."
                : "공식 안내와 연락처를 모았어요."
              : en
                ? "Choose on-site help or information."
                : "직원 도움과 이용 안내 중 하나를 골라 주세요."}
          </p>
        </div>
      </header>
      {!info ? (
        <div className="traffic-intent-options">
          <button
            type="button"
            className="traffic-intent"
            data-traffic-intent="dispatch"
            onClick={onDispatch}
          >
            <span className="service-info-icon">
              <UserRound aria-hidden="true" />
            </span>
            <span>
              <strong>
                {en ? "I need help on site" : "직원이 와서 도와주세요"}
              </strong>
              <small>
                {en
                  ? "Parking, taxi boarding, bus or shuttle assistance"
                  : "주차장 현장 지원 · 택시 승차 · 버스·셔틀 이용 도움"}
              </small>
            </span>
          </button>
          <button
            type="button"
            className="traffic-intent"
            data-traffic-intent="info"
            onClick={onInfo}
          >
            <span className="service-info-icon">
              <Bus aria-hidden="true" />
            </span>
            <span>
              <strong>
                {en ? "I only need information" : "이용 방법만 알고 싶어요"}
              </strong>
              <small>
                {en
                  ? "Routes, stops, parking and fares"
                  : "노선·승차장·주차 위치·요금 안내"}
              </small>
            </span>
          </button>
        </div>
      ) : (
        <section className="traffic-information service-info-card">
          <h2>{en ? "Transport information" : "교통 이용 안내"}</h2>
          <div className="traffic-links">
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
          </div>
          <div className="booking-actions">
            <button className="booking-sample" type="button" onClick={onBack}>
              {en ? "Back" : "이전"}
            </button>
            <button
              className="btn btn-primary btn-inline"
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
