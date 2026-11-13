import { describe, expect, it } from "vitest";
import { kioskHelpHref, kioskHomeHref, previewPlaceId, withPreview } from "../src/lib/help-entry";

// 기기 화면 미리보기(?preview=1)를 다음 화면으로 잇는 규칙. 잇지 않으면 「현장 기기 설치」나 여객 웹 화면으로 바뀌었다.
describe("기기 화면 미리보기", () => {
  it("미리보기일 때만 돌아갈 키오스크의 시연 자리를 준다", () => {
    expect(previewPlaceId("1", "/kiosk/entry")).toBe("t1-info");
    expect(previewPlaceId("1", "/kiosk/guide")).toBe("cc-center");
    expect(previewPlaceId("1", undefined)).toBe("cc-center");
    expect(previewPlaceId("1", "https://evil.example")).toBe("cc-center");
    expect(previewPlaceId(undefined, "/kiosk/entry")).toBeUndefined();
    expect(previewPlaceId("0", "/kiosk/entry")).toBeUndefined();
  });
  it("주소에 preview=1 을 알맞게 붙인다", () => {
    expect(withPreview("/kiosk/visits", true)).toBe("/kiosk/visits?preview=1");
    expect(withPreview("/help?topic=mobility", true)).toBe("/help?topic=mobility&preview=1");
    expect(withPreview("/help#top", true)).toBe("/help?preview=1#top");
    expect(withPreview("/help", false)).toBe("/help");
    expect(kioskHomeHref("/kiosk/entry", true, true)).toBe("/kiosk/entry?lang=en&preview=1");
    expect(kioskHomeHref("/kiosk/guide", false, false)).toBe("/kiosk/guide");
  });
  it("도움 요청 주소도 미리보기를 잇는다", () => {
    expect(kioskHelpHref(null, "ko", "mobility", "/kiosk/entry", false, true)).toContain("preview=1");
    expect(kioskHelpHref(null, "ko", "mobility", "/kiosk/entry")).not.toContain("preview");
  });
});
