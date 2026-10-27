"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Navigation, Plane, ClipboardCheck } from "lucide-react";
import { TaskLauncher } from "./TaskLauncher";
import { MyRequestPanel } from "./MyRequestPanel";
export function TaskHome({ en = false }: { en?: boolean }) {
  const [gate, setGate] = useState("");
  const router = useRouter();
  const q = en ? "?lang=en" : "";
  return (
    <>
      <section className="task-home-hero" aria-labelledby="home-title">
        <div className="task-home-intro">
          <p>
            공항 이용 지원 <span>Airport Assist</span>
          </p>
          <h1 id="home-title">
            {en ? (
              <>
                Your next stop,
                <br />
                made easier.
              </>
            ) : (
              <>
                공항에서의 이동,
                <br />
                여기서 시작하세요.
              </>
            )}
          </h1>
          <Link href={"/help?topic=mobility&fresh=1" + (en ? "&lang=en" : "")}>
            {en ? "Need someone to help you?" : "이동에 도움이 필요하신가요?"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <form
          className="home-gate-form"
          onSubmit={(e) => {
            e.preventDefault();
            const params = new URLSearchParams({ gate });
            if (en) params.set("lang", "en");
            router.push("/navigate?" + params);
          }}
        >
          <span className="home-form-symbol">
            <Navigation aria-hidden="true" />
          </span>
          <h2>{en ? "Find your boarding gate" : "탑승구로 가는 길"}</h2>
          <label htmlFor="home-gate">
            {en ? "Gate number" : "탑승구 번호"}
          </label>
          <div className="home-gate-input">
            <input
              id="home-gate"
              inputMode="numeric"
              pattern="[0-9]{1,3}"
              maxLength={3}
              required
              placeholder={en ? "e.g. 130" : "예: 130"}
              value={gate}
              onChange={(e) => setGate(e.target.value.replace(/\D/g, ""))}
            />
            <button type="submit">
              {en ? "Find route" : "경로 찾기"}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <Link href={"/navigate" + q}>
            {en
              ? "Find a restroom or another facility"
              : "화장실·편의시설 찾기"}
          </Link>
        </form>
      </section>
      <div className="task-home-status">
        <MyRequestPanel lang={en ? "en" : "ko"} />
      </div>
      <section
        className="task-home-services"
        aria-labelledby="home-service-title"
      >
        <div className="task-section-heading">
          <h2 id="home-service-title">
            {en ? "What would you like to do?" : "어떤 도움이 필요하세요?"}
          </h2>
          <Link href={"/services" + q}>
            {en ? "Search all services" : "전체 서비스 검색"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <TaskLauncher en={en} />
      </section>
      <section
        className="task-preflight"
        aria-label={en ? "Before your visit" : "공항 도착 전"}
      >
        <Plane aria-hidden="true" />
        <div>
          <h2>
            {en ? "Coming to the airport?" : "아직 공항에 도착하기 전이라면"}
          </h2>
          <p>
            {en
              ? "Save your flight and support needs before you travel."
              : "항공편과 필요한 도움을 미리 등록해 두세요."}
          </p>
        </div>
        <Link href={"/prepare" + q}>
          <ClipboardCheck aria-hidden="true" />
          {en ? "Register support needs" : "여행 전 지원등록"}
          <ArrowRight aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
