"use client";

import Image from "next/image";
import { Gift } from "lucide-react";
import type { ThemeId } from "@/lib/stamp-book";
import type { StampLang } from "./copy";
import { StampMark } from "./art";

/*
 * 스탬프북을 놀이처럼 느끼게 하는 조각들.
 * - 나랑이가 말풍선으로 진행에 맞춰 한마디씩 한다(NarangiSays, cheerLine, boardLine).
 * - 도장 칸 판: 모은 도장이 칸을 채우고, 마지막 칸에는 보상(선물)이 보인다(StampBoard).
 * - 도장을 받은 순간의 반짝이(Burst).
 * 움직임은 하나하나 240ms 이하로 짧게 두고 차례로 이어 붙인다. 모션 줄이기 설정이면 모두 끈다(stamp.css).
 */

const FACE = { front: "/stamp/narangi.webp", side: "/stamp/narangi-left.webp" } as const;

export function NarangiSays({
  text,
  face = "front",
  size = "md",
  pop = false,
}: {
  text: string;
  face?: keyof typeof FACE;
  size?: "sm" | "md" | "lg";
  /** 도장을 받은 순간처럼 튀어나오며 말한다 */
  pop?: boolean;
}) {
  return (
    <div className={`sb-says sb-says-${size}${pop ? " is-pop" : ""}`}>
      <Image
        className="sb-says-face"
        src={FACE[face]}
        alt=""
        aria-hidden="true"
        width={face === "front" ? 480 : 363}
        height={face === "front" ? 480 : 464}
      />
      <p className="sb-says-bubble" role="status">
        {text}
      </p>
    </div>
  );
}

/** 도장을 받은 순간 나랑이의 한마디 */
export function cheerLine(n: number, goal: number, lang: StampLang) {
  const left = Math.max(0, goal - n);
  if (lang === "en") {
    if (goal > 0 && left === 0) return "You did it! Every stamp is yours!";
    if (n === 1) return "Your first stamp! Great start!";
    if (left === 1) return "Just one more to go!";
    if (n * 2 >= goal) return "Over halfway there. Amazing!";
    return "Nice! Let's find the next one!";
  }
  if (goal > 0 && left === 0) return "다 모았어요! 정말 최고예요!";
  if (n === 1) return "첫 도장 쾅! 출발이 좋아요!";
  if (left === 1) return "딱 하나 남았어요! 거의 다 왔어요!";
  if (n * 2 >= goal) return "벌써 반 넘게 왔어요! 멋져요!";
  return "좋아요! 다음 도장도 찾으러 가요!";
}

/** 수첩 판 위에서 나랑이의 한마디 */
export function boardLine(n: number, goal: number, nextPlace: string, reward: string, lang: StampLang) {
  const left = Math.max(0, goal - n);
  if (lang === "en") {
    if (goal > 0 && left === 0) return `All stamps collected! Let's unlock your ${reward}.`;
    if (n === 0) return `Collect ${goal} stamps to unlock your ${reward}. The first one is at ${nextPlace}!`;
    return `${left} more to go! The next stamp is at ${nextPlace}.`;
  }
  if (goal > 0 && left === 0) return `도장을 다 모았어요! ${reward} 받으러 가요!`;
  if (n === 0) return `도장 ${goal}개를 모으면 ${reward}가 열려요. 첫 도장은 「${nextPlace}」에 있어요!`;
  return `${left}개 남았어요! 다음 도장은 「${nextPlace}」에 있어요.`;
}

/**
 * 도장 칸 판. 모은 만큼 도장이 찍히고, 다음 칸은 점선으로 기다리며, 마지막 칸에는 보상 선물이 보인다.
 * fresh: 방금 찍은 칸(0부터). 그 칸만 「쾅」 찍히는 움직임을 준다.
 */
export function StampBoard({
  theme,
  n,
  goal,
  fresh,
  lang,
}: {
  theme: ThemeId;
  n: number;
  goal: number;
  fresh?: number;
  lang: StampLang;
}) {
  if (goal <= 0) return null;
  return (
    <ol
      className="sb-board"
      aria-label={lang === "en" ? `${n} of ${goal} stamps` : `도장 ${goal}개 중 ${n}개`}
      style={{ ["--slots" as string]: String(Math.min(goal, 6)) }}
    >
      {Array.from({ length: goal }, (_, k) => {
        const filled = k < n;
        const state = filled ? "filled" : k === n ? "next" : "empty";
        return (
          <li
            key={k}
            className={`sb-slot is-${state}${k === fresh ? " is-fresh" : ""}${k === goal - 1 ? " is-goal" : ""}`}
            aria-hidden="true"
            style={{ ["--tilt" as string]: `${((k * 7) % 5) * 4 - 8}deg` }}
          >
            {filled ? (
              <StampMark theme={theme} size={64} />
            ) : k === goal - 1 ? (
              <Gift />
            ) : (
              <span className="num">{k + 1}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** 도장을 받은 순간 도장 둘레로 퍼지는 반짝이. 꾸밈이라 읽지 않는다. */
export function Burst() {
  return (
    <span className="sb-burst" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} style={{ ["--a" as string]: `${i * 36}deg`, ["--d" as string]: `${(i % 3) * 40}ms` }} />
      ))}
    </span>
  );
}
