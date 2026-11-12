"use client";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CalendarClock, Plane, Stamp } from "lucide-react";
import { TaskLauncher } from "./TaskLauncher";
import { MyRequestPanel } from "./MyRequestPanel";

/**
 * 여객 첫 화면.
 * 1) 무엇을 하는 곳인지 제목 한 줄. 2) 공항에 오기 전이면 「출발부터 탑승까지 도움 신청」(이 서비스의 핵심, 화면의 강조 하나).
 * 3) 공항에서 바로 쓰는 서비스 카드(이름만, 작은 설명 글은 두지 않는다 — 2026-11-12 사용자 요청).
 */
export function TaskHome({ en = false }: { en?: boolean }) {
  const q = en ? "?lang=en" : "";
  return (
    <div className="ph-home">
      <section className="ph-hero" aria-labelledby="home-title">
        <div className="ph-hero-copy">
          <h1 id="home-title">{en
            ? "How can we help at the airport?"
            : <><span>공항에서 무엇을</span>{" "}<span>도와드릴까요?</span></>}</h1>
        </div>
        <div className="ph-hero-art" aria-hidden="true">
          <span className="ph-hero-orbit" />
          <Image src="/images/haneuli/narangi.webp" alt="" width={1280} height={1280} priority sizes="(max-width: 760px) 144px, 256px" />
        </div>
      </section>
      <div className="ph-home-lead">
        <section className="ph-prepare" aria-labelledby="home-prepare-title">
          <span className="ph-prepare-icon">
            <Plane aria-hidden="true" />
          </span>
          <h2 id="home-prepare-title">
            {en ? "Not at the airport yet?" : "공항에 가기 전이라면"}
          </h2>
          <Link className="btn btn-primary ph-prepare-go" href={"/prepare" + q}>
            {en ? "Get help from arrival to boarding" : "출발부터 탑승까지 도움 신청"}
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
        {/* 서비스 칸과 스탬프북을 한 묶음(2열 × 3줄)으로 둔다. */}
        <div className="ph-list">
          <TaskLauncher en={en} />
          <article className="task-action task-action-stamp">
            <Stamp aria-hidden="true" className="task-action-icon" strokeWidth={1.7} />
            <Link href={"/stamp" + q} className="task-action-link">
              <span>
                <strong>{en ? "Airport stamp book" : "공항 스탬프북"}</strong>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>
    </div>
  );
}
