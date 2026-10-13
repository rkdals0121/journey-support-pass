"use client";

import { useEffect, type RefObject } from "react";

/**
 * 화면 위에 뜬 창이 열려 있는 동안 키보드 초점이 창 밖으로 나가지 않게 한다.
 * Tab 으로 끝까지 가면 처음으로, Shift+Tab 으로 처음에서 끝으로 돈다.
 * 초점이 창 밖에 있으면(창 뒤의 버튼에 남아 있으면) 창 안의 첫 버튼으로 옮긴다.
 * 창이 닫히면 열기 전에 있던 자리로 초점을 돌려준다.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const before = document.activeElement as HTMLElement | null;
    const items = () => [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input, [tabindex]:not([tabindex='-1'])") ?? [])];
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      // 창이 둘 겹쳐 있으면(설정 창 위에 "계속 이용하시겠어요?"가 뜬 경우) 맨 위의 창만 초점을 붙든다.
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open.length > 0 && open[open.length - 1] !== ref.current) return;
      const list = items();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const at = document.activeElement as HTMLElement | null;
      const inside = !!at && !!ref.current?.contains(at);
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && at === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // 창을 연 버튼이 아직 화면에 있으면 그리로 돌아간다.
      if (before && document.contains(before)) before.focus();
    };
  }, [ref, active]);
}
