"use client";

import { useEffect, useRef, useState } from "react";
import type { NarangApi, NarangMood } from "@/lib/narang/narang";

/**
 * 나랑이 3D(키오스크 첫 화면). 감싼 칸(.haneuli-character) 크기를 그대로 따라 그린다.
 * - 처음에는 아무것도 그리지 않고, 3D 가 준비되면(onReady) 부모에 data-narang-3d 를 붙여 기존 그림(webp)을 감춘다.
 *   3D 를 못 쓰면(WebGL2 없음, 움직임 줄이기, 불러오기 실패) 기존 그림이 그대로 남는다.
 * - 자다가(sleep) 깨면(awake) wake() 연출, 그 밖에는 setMood.
 * - 화면 점검 프로그램(navigator.webdriver)에서는 그리지 않는다(GPU 없는 점검 환경에서 느려지고, 그림 그대로 점검한다).
 *   주소에 ?narang3d=1 이 있으면 점검 중에도 그린다.
 * 모델·그림 출처: 팀 저장소 rkdals0121/narang-3d v3(나랑이 원본 그림으로 만든 3D, 팀 자체 제작).
 */
export function Narangi3D({ mood }: { mood: NarangMood }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<NarangApi | null>(null);
  const shown = useRef<NarangMood>(mood);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const forced = new URLSearchParams(window.location.search).get("narang3d") === "1";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!forced && (navigator.webdriver || reduced)) return;
    let alive = true;
    import("@/lib/narang/narang").then(({ canRender3D, createNarang }) => {
      if (!alive || !canRender3D()) return;
      api.current = createNarang(el, {
        model: "/narang/narang_lite.glb",
        sleepModel: "/narang/sleep.glb",
        mood: shown.current,
        // 키오스크: 화면을 누르면 나랑이가 깨어나는 동작이 따로 있어 끌어 돌리기·눌러 점프는 끈다. 사람 쪽 바라보기만 켠다.
        dragToRotate: false,
        tapToJump: false,
        lookAtPointer: true,
        onReady: () => { if (alive) setReady(true); },
        onError: () => { if (alive) setReady(false); },
      });
    }).catch(() => undefined);
    return () => {
      alive = false;
      api.current?.dispose();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const n = api.current;
    const before = shown.current;
    shown.current = mood;
    if (!n || before === mood) return;
    if (before === "sleep" && mood !== "sleep") {
      n.wake();
      if (mood === "happy") n.setMood("happy");
    } else n.setMood(mood);
  }, [mood]);

  useEffect(() => {
    const host = canvas.current?.parentElement;
    if (!host) return;
    if (ready) host.setAttribute("data-narang-3d", "");
    else host.removeAttribute("data-narang-3d");
    return () => host.removeAttribute("data-narang-3d");
  }, [ready]);

  return <canvas ref={canvas} className="narang-3d" aria-hidden="true" />;
}
