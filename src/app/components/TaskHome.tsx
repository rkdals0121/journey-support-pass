"use client";
import Link from "next/link";
import { ArrowRight, CalendarClock, Plane, Stamp } from "lucide-react";
import { TaskLauncher } from "./TaskLauncher";
import { MyRequestPanel } from "./MyRequestPanel";

/**
 * 여객 첫 화면.
 * 1) 무엇을 하는 곳인지 한 줄. 2) 공항에 오기 전이면 「여행 전 지원 등록」(이 서비스의 핵심, 화면의 강조 하나).
 * 3) 공항에서 바로 쓰는 서비스 카드를 보여 준다.
 */
export function TaskHome({ en = false }: { en?: boolean }) {
  const q = en ? "?lang=en" : "";
  return (
    <div className="ph-home">
      <div className="ph-home-lead">
        <section className="ph-hero" aria-labelledby="home-title">
          <h1 id="home-title">
            {en ? "How can we help at the airport?" : "공항에서 무엇을 도와드릴까요?"}
          </h1>
          <p>
            {en
              ? "Directions, mobility help and on-site requests for passengers who need a little more support."
              : "도움이 조금 더 필요한 여객을 위한 길 안내, 이동 도움, 현장 요청을 한곳에서."}
          </p>
        </section>
        <section className="ph-prepare" aria-labelledby="home-prepare-title">
          <span className="ph-prepare-icon">
            <Plane aria-hidden="true" />
          </span>
          <h2 id="home-prepare-title">
            {en ? "Not at the airport yet?" : "공항에 가기 전이라면"}
          </h2>
          <p>
            {en
              ? "Register your flight and the help you need. Airport kiosks and staff pick it up from your boarding pass."
              : "항공편과 필요한 도움을 미리 등록하세요. 공항 키오스크와 직원이 탑승권으로 그대로 이어받아요."}
          </p>
          <Link className="btn btn-primary ph-prepare-go" href={"/prepare" + q}>
            {en ? "Register support before you travel" : "여행 전 지원 등록"}
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="ph-text-link" href={"/visits" + q}>
            <CalendarClock aria-hidden="true" />
            {en ? "Arrange a meeting before you arrive" : "만날 장소·시간 미리 예약"}
          </Link>
        </section>
        <div className="task-home-status">
          <MyRequestPanel lang={en ? "en" : "ko"} hideWhenEmpty />
        </div>
      </div>
      <section className="ph-services" aria-label={en ? "Airport services" : "공항 서비스"}>
        {/* 서비스 칸과 스탬프북을 한 묶음(2열 × 3줄)으로 둔다. 스탬프북은 한국어 화면만 있다. */}
        <div className="ph-list">
          <TaskLauncher en={en} />
          <article className="task-action task-action-stamp">
            <Stamp aria-hidden="true" className="task-action-icon" strokeWidth={1.7} />
            <Link href="/stamp" className="task-action-link">
              <span>
                <strong>{en ? "Airport stamp book (Korean)" : "공항 스탬프북"}</strong>
                <small>{en ? "Collect stamps with your child" : "아이와 도장 모으기"}</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>
    </div>
  );
}
