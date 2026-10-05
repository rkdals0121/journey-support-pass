import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { extractToken } from "@/lib/passes";

const TOKEN = "abcDEF_123-xyz4567890123";
const URL_ = `https://journey-support-pass.vercel.app/p/${TOKEN}`;

/** 패스 인쇄 화면과 같은 설정으로 QR 을 만들어 px 크기의 흑백 그림으로 그린다. */
function render(px: number, margin: number) {
  const qr = QRCode.create(URL_, { errorCorrectionLevel: "M" });
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
// 읽은 글자에서 토큰이 나오는지까지를 확인한다.
describe("패스 QR", () => {
  it("화면에 그리는 크기에서 읽히고 토큰이 나온다", () => {
    const { data } = render(240, 4);
    const found = jsQR(data, 240, 240, { inversionAttempts: "dontInvert" });
    expect(found?.data).toBe(URL_);
    expect(extractToken(found!.data)).toBe(TOKEN);
  });

  it("카메라에 작게 잡혀도(120px) 읽힌다", () => {
    const { data } = render(120, 4);
    expect(jsQR(data, 120, 120, { inversionAttempts: "dontInvert" })?.data).toBe(URL_);
  });

  it("QR 칸 수가 인쇄 크기 25mm 에서 한 칸 0.5mm 이상이다", () => {
    const { modules } = render(240, 4);
    expect(25 / (modules + 8)).toBeGreaterThanOrEqual(0.5);
  });
});
