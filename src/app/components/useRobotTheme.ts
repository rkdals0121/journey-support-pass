"use client";

import { useEffect } from "react";

/**
 * 안내로봇 키오스크의 파란 색(globals.css 의 .robot-theme)을 화면 전체에 건다. 이 화면을 떠나면 걷는다.
 * body 에 거는 까닭: 키오스크 화면은 여러 조각(직원 부르기 줄, 묻는 창)이 따로 그려져, 한 상자로 감싸면 빠지는 곳이 생긴다.
 */
export function useRobotTheme() {
  useEffect(() => {
    document.body.classList.add("robot-theme");
    return () => document.body.classList.remove("robot-theme");
  }, []);
}
