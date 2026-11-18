"use client";
import Link from "next/link";
import { ChevronLeft, House } from "lucide-react";
import { useRouter } from "next/navigation";

/** 화면 안의 단계 흐름(현장 도움 요청 등)이 「이전」을 받아 처리하는 이벤트. 받지 않으면 처음 화면(서비스 고르기)으로 간다. */
export const FIELD_TASK_BACK = "field-task-back";

/** 키오스크·안내로봇 화면 위쪽 바 왼쪽: 「이전」「처음으로」. 키오스크 첫 화면 바와 같은 자리·같은 크기. */
export function FieldTaskNav({ en, homeHref }: { en: boolean; homeHref: string }) {
  const router = useRouter();
  return (
    <nav className="field-task-nav" aria-label={en ? "Navigation" : "이동"}>
      <button
        type="button"
        onClick={() => {
          const event = new CustomEvent(FIELD_TASK_BACK, { cancelable: true });
          if (window.dispatchEvent(event)) router.push(homeHref);
        }}
      >
        <ChevronLeft aria-hidden="true" />
        <span>{en ? "Back" : "이전"}</span>
      </button>
      <Link href={homeHref} className="field-task-back">
        <House aria-hidden="true" />
        <span>{en ? "Home" : "처음으로"}</span>
      </Link>
    </nav>
  );
}
