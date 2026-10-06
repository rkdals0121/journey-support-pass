"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { Brand } from "./components/Sunflower";

// 화면을 그리다 문제가 생겼을 때. 직원에게는 구두 확인으로 넘어가라고 알린다.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <Brand />
      <div className="empty">
        <span className="bubble bubble-sun">
          <CircleAlert size={26} aria-hidden="true" />
        </span>
        <strong>화면을 불러오지 못했습니다</strong>
        <p>잠시 후 다시 시도해 주세요. 직원은 여객에게 구두로 확인해 주세요.</p>
      </div>
      <button className="btn btn-primary" onClick={reset}>
        다시 시도
      </button>
      <Link className="btn" href="/">
        첫 화면으로
      </Link>
    </main>
  );
}
