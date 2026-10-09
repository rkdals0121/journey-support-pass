import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { extractToken, passUrl } from "@/lib/passes";

// 모양만 맞는 값. 대문자와 숫자 16자다.
const TOKEN = "7K2M9QXW4HT8VB3N";
const BASE = "https://journey-support-pass.vercel.app";
const URL_ = passUrl(BASE, TOKEN);

/** 패스 화면과 같은 설정으로 QR 을 만들어 px 크기의 흑백 그림으로 그린다. */
function render(text: string, px: number, margin: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const total = n + margin * 2;
  const data = new Uint8ClampedArray(px * px * 4);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const mx = Math.floor((x * total) / px) - margin;
      const my = Math.floor((y * total) / px) - margin;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.get(my, mx) === 1;
      const v = dark ? 0 : 255;
      const i = (y * px + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, modules: n };
}

// 카메라는 검사에서 쓸 수 없다. 화면이 쓰는 인식기(jsQR)가 우리 QR 을 읽고,
// 읽은 글자에서 패스 값이 나오는지까지를 확인한다.
describe("패스 QR", () => {
  it("QR 에 넣는 주소는 전부 대문자다", () => {
    expect(URL_).toBe(`HTTPS://JOURNEY-SUPPORT-PASS.VERCEL.APP/P/${TOKEN}`);
  });

  it("화면에 그리는 크기에서 읽히고 패스 값이 나온다", () => {
    const { data } = render(URL_, 240, 4);
    const found = jsQR(data, 240, 240, { inversionAttempts: "dontInvert" });
    expect(found?.data).toBe(URL_);
    expect(extractToken(found!.data)).toBe(TOKEN);
  });

  it("카메라에 작게 잡혀도(120px) 읽힌다", () => {
    const { data } = render(URL_, 120, 4);
    expect(jsQR(data, 120, 120, { inversionAttempts: "dontInvert" })?.data).toBe(URL_);
  });

  it("QR 칸 수가 인쇄 크기 25mm 에서 한 칸 0.5mm 이상이다", () => {
    const { modules } = render(URL_, 240, 4);
    expect(25 / (modules + 8)).toBeGreaterThanOrEqual(0.5);
  });

  it("대문자 주소는 QR 의 영숫자 방식으로 담긴다. 소문자 주소보다 칸 수가 많지 않다", () => {
    const upper = QRCode.create(URL_, { errorCorrectionLevel: "M" });
    const lower = QRCode.create(URL_.toLowerCase(), { errorCorrectionLevel: "M" });
    expect(upper.segments.map((s) => s.mode.id)).toEqual(["Alphanumeric"]);
    expect(lower.segments.map((s) => s.mode.id)).not.toEqual(["Alphanumeric"]);
    expect(upper.modules.size).toBeLessThanOrEqual(lower.modules.size);
  });

  it("소문자로 바뀐 주소를 읽어도 같은 패스 값이 나온다", () => {
    const { data } = render(URL_.toLowerCase(), 240, 4);
    const found = jsQR(data, 240, 240, { inversionAttempts: "dontInvert" });
    expect(extractToken(found!.data)).toBe(TOKEN);
  });
});
