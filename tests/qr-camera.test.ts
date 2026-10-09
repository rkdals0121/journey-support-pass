import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { passUrl } from "@/lib/pass-format";

const URL_ = passUrl("https://journey-support-pass.vercel.app", "7K2M9QX4BT0HWZ3C");

interface Shot {
  /** QR 한 칸이 카메라 그림에서 차지하는 화소 수. 작을수록 멀리서 찍은 것이다. */
  pxPerModule: number;
  /** 기울어진 각도(도). */
  rotate?: number;
  /** 초점이 덜 맞은 정도. 이웃 화소를 섞는 횟수. */
  blur?: number;
  /** 화소마다 섞는 잡음의 크기 (0~255). */
  noise?: number;
  /** 밝고 어두움의 차이를 줄인다 (1 이면 그대로, 0.4 면 흐린 조명). */
  contrast?: number;
  /** 흑백을 뒤집는다 (휴대전화 화면이 어두운 바탕일 때). */
  invert?: boolean;
}

/**
 * 스티커나 휴대전화 화면의 QR 을 카메라가 찍은 것처럼 만든다.
 * 화면이 쓰는 것과 같은 설정(오류 정정 M, 둘레 여백 4칸)으로 QR 을 만든 뒤, 기울이고 흐리게 하고 잡음을 섞는다.
 */
function shoot(text: string, s: Shot) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const margin = 4;
  const side = (n + margin * 2) * s.pxPerModule;
  // 기울여도 잘리지 않게 둘레에 흰 바탕을 더 둔다.
  const size = Math.ceil(side * 1.5);
  const angle = ((s.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let gray = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 화소 하나를 3x3 으로 나눠 평균을 낸다. 칸의 경계가 화소 한가운데 걸리는 실제 카메라와 같게 한다.
      let sum = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const dx = x + (sx + 0.5) / 3 - size / 2;
          const dy = y + (sy + 0.5) / 3 - size / 2;
          const mx = Math.floor((dx * cos + dy * sin + side / 2) / s.pxPerModule - margin);
          const my = Math.floor((-dx * sin + dy * cos + side / 2) / s.pxPerModule - margin);
          const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.get(my, mx) === 1;
          sum += dark ? 0 : 255;
        }
      }
      gray[y * size + x] = sum / 9;
    }
  }
  for (let pass = 0; pass < (s.blur ?? 0); pass++) {
    const next = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
            sum += gray[yy * size + xx];
            count++;
          }
        }
        next[y * size + x] = sum / count;
      }
    }
    gray = next;
  }
  // 늘 같은 잡음이 나오게 정해진 수열을 쓴다. 검사가 돌 때마다 결과가 달라지면 안 된다.
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const contrast = s.contrast ?? 1;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    let v = 128 + (gray[i] - 128) * contrast + (rand() - 0.5) * 2 * (s.noise ?? 0);
    if (s.invert) v = 255 - v;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { data, size };
}

// 화면의 스캐너(Scanner.tsx)와 같은 설정으로 읽는다.
const read = (s: Shot) => {
  const { data, size } = shoot(URL_, s);
  return jsQR(data, size, size, { inversionAttempts: "attemptBoth" })?.data ?? null;
};

// 진짜 카메라는 검사에서 쓸 수 없다. 대신 화면이 쓰는 인식기(jsQR)가 우리 QR 을 나쁜 조건에서도 읽는지 확인한다.
// 예전에 QR 이 잘 안 읽힌다는 문제가 있었던 자리라, 조건을 하나씩 나쁘게 해 본다.
describe("카메라에 찍힌 패스 QR", () => {
  it("또렷하게 찍히면 읽힌다", () => {
    expect(read({ pxPerModule: 6 })).toBe(URL_);
  });

  it("멀리서 작게 찍혀 한 칸이 3화소여도 읽힌다", () => {
    expect(read({ pxPerModule: 3 })).toBe(URL_);
  });

  it("기울어져도 읽힌다 (10도, 25도, 45도)", () => {
    for (const rotate of [10, 25, 45]) expect(read({ pxPerModule: 5, rotate })).toBe(URL_);
  });

  it("초점이 덜 맞고 잡음이 있어도 읽힌다", () => {
    expect(read({ pxPerModule: 5, blur: 1, noise: 20, rotate: 8 })).toBe(URL_);
  });

  it("조명이 흐려 밝고 어두움의 차이가 작아도 읽힌다", () => {
    expect(read({ pxPerModule: 5, contrast: 0.4, noise: 12, rotate: 5 })).toBe(URL_);
  });

  it("작고 기울고 흐린, 나쁜 조건이 겹쳐도 읽힌다", () => {
    expect(read({ pxPerModule: 4, blur: 1, noise: 10, rotate: 12, contrast: 0.7 })).toBe(URL_);
  });

  it("휴대전화 화면이 어두운 바탕이라 흑백이 뒤집혀도 읽힌다", () => {
    expect(read({ pxPerModule: 5, invert: true })).toBe(URL_);
  });
});
