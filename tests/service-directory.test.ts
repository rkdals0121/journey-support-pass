import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ServiceDirectory } from "@/app/components/ServiceDirectory";
import { portalSupportCards } from "@/app/components/PortalSupport";

function checkCount(extraCards: ReturnType<typeof portalSupportCards>, lang: "ko" | "en" = "ko") {
  const html = renderToStaticMarkup(createElement(ServiceDirectory, {lang, portal:true, extraCards}));
  const rendered = (html.match(/class="task-action"/g) ?? []).length;
  const displayed = html.match(lang === "en" ? /(\d+) services/ : /서비스 (\d+)개/);
  expect(displayed).not.toBeNull();
  expect(Number(displayed![1])).toBe(rendered);
  return rendered;
}

describe("서비스 안내의 실제 카드 개수", () => {
  it.each(["ko", "en"] as const)("%s: 기본 서비스와 포털 카드의 실제 표시 개수가 같다", lang => {
    checkCount(portalSupportCards({lang}), lang);
  });
  it("등록·요청 카드를 숨겨도 표시 개수가 실제 카드와 같다", () => {
    checkCount(portalSupportCards({showPrepare:false}));
    checkCount(portalSupportCards({showRequests:false}));
    checkCount(portalSupportCards({showPrepare:false, showRequests:false}));
  });
  it("추가 카드를 늘리거나 제거하면 개수도 함께 바뀐다", () => {
    const cards = portalSupportCards();
    const before = checkCount(cards);
    expect(checkCount([...cards, createElement("article", {key:"new-service", className:"task-action"}, "새 서비스")])).toBe(before + 1);
    expect(checkCount(cards.slice(1))).toBe(before - 1);
    expect(checkCount([])).toBe(before - cards.length);
  });
});
