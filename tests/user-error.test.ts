import { describe, expect, it } from "vitest";
import { userErrorMessage } from "../src/lib/user-error";

// 브라우저의 영어 원문 오류(「Failed to fetch」)가 화면에 그대로 나오던 것
describe("화면 오류 문구", () => {
  it("연결이 끊기면 쉬운 말로", () => {
    expect(userErrorMessage(new TypeError("Failed to fetch"), false)).toContain("연결이 끊겼어요");
    expect(userErrorMessage(new TypeError("Failed to fetch"), true)).toContain("Connection lost");
  });
  it("시간이 넘으면 느리다고", () => {
    expect(userErrorMessage(new DOMException("x", "TimeoutError"), false)).toContain("연결이 느려요");
    expect(userErrorMessage(new DOMException("x", "AbortError"), true)).toContain("slow");
  });
  it("서버가 보낸 문구는 그대로", () => {
    expect(userErrorMessage(new Error("이미 접수된 요청이 있어요"), false)).toBe("이미 접수된 요청이 있어요");
  });
  it("알 수 없는 값도 빈 글로 두지 않는다", () => {
    expect(userErrorMessage(undefined, false)).not.toBe("");
  });
});
