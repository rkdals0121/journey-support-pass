"use client";

import { useEffect, useRef, useState } from "react";

type Size = { id: string; ko: string; en: string; w: number; h: number };

// 기기 화면의 실제 해상도(브라우저 안쪽 크기). 이 값은 기기가 정해 둔 것이라 인라인 숫자로 둔다.
const SIZES: Record<"robot" | "kiosk", Size[]> = {
  robot: [{ id: "robot", ko: "안내로봇 27인치 세로 1080×1920", en: "Guide robot 27-inch portrait 1080×1920", w: 1080, h: 1920 }],
  kiosk: [
    { id: "wide", ko: "가로 키오스크 1920×1080", en: "Landscape kiosk 1920×1080", w: 1920, h: 1080 },
    { id: "four3", ko: "장애인 키오스크 4:3 1024×768", en: "Accessible kiosk 4:3 1024×768", w: 1024, h: 768 },
  ],
};

/**
 * 실제 키오스크 화면(/kiosk/entry, /kiosk/guide)을 기기 크기 그대로 틀(iframe)에 띄우고 보이는 폭에 맞게 줄여 보여 준다.
 * 모형 화면이 아니라 진짜 화면이라서, 키오스크 화면을 고치면 미리보기도 같이 바뀐다.
 * 설치 쿠키 없이 열리도록 ?preview=1 을 붙인다. 여권·QR 스캔을 미리보기에서도 해 볼 수 있게 카메라는 허용한다
 * (허용 창은 스캔을 누를 때만 뜬다). 마이크는 사이트 전체에서 막혀 있어 켜지 않는다.
 */
export function DeviceFrame({ device, lang }: { device: "robot" | "kiosk"; lang: "ko" | "en" }) {
  const en = lang === "en";
  const sizes = SIZES[device];
  const [pick, setPick] = useState(0);
  const size = sizes[pick];
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const fit = () => {
      // 세로 안내로봇은 미리보기 칸 폭이 화면 크기를 따라가므로(옆 칸과 간격 16px), 폭 제한은 위쪽 바 폭의 절반으로 둔다
      const bar = document.querySelector(".public-header")?.getBoundingClientRect().width ?? window.innerWidth;
      const room = device === "robot" ? bar / 2 : box.current?.clientWidth ?? 0;
      // 틀 위쪽부터 바닥 줄 위(박스 간격 --space-4 하나)까지 남는 높이에 꼭 맞춘다(아래가 비거나 페이지가 넘치던 것).
      // 다만 글이 보이도록 0.22배 아래로는 줄이지 않는다.
      const top = (box.current?.getBoundingClientRect().top ?? 200) + window.scrollY;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const footer = document.querySelector(".public-footer");
      const below = footer ? footer.getBoundingClientRect().height + parseFloat(getComputedStyle(footer).marginBottom || "0") + rem : 5.5 * rem;
      const high = Math.max(0.22, (window.innerHeight - top - below) / size.h);
      setScale(Math.max(0.1, Math.min(1, room / size.w, high)));
    };
    fit();
    const watch = new ResizeObserver(fit);
    if (box.current) watch.observe(box.current);
    window.addEventListener("resize", fit);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [size.w, size.h]);

  const src = `/kiosk/${device === "robot" ? "entry" : "guide"}?preview=1${en ? "&lang=en" : ""}`;
  return (
    <section className="dv-frame" aria-label={en ? "Device screen preview" : "기기 화면 미리보기"}>
      {sizes.length > 1 && (
        <div className="dv-frame-sizes" role="group" aria-label={en ? "Screen size" : "화면 크기"}>
          {sizes.map((s, i) => (
            <button key={s.id} type="button" aria-pressed={i === pick} onClick={() => setPick(i)}>
              {en ? s.en : s.ko}
            </button>
          ))}
        </div>
      )}
      <div ref={box} className="dv-frame-box">
        {scale > 0 && (
          <div className="dv-frame-screen" style={{ width: size.w * scale, height: size.h * scale }}>
            <iframe
              key={size.id + src}
              title={en ? "Live device screen" : "실제 기기 화면"}
              src={src}
              allow="camera; microphone 'none'"
              // 틀(.dv-frame-screen)과 같은 둥근 모서리로 화면을 자른다. 줄이기 전 크기에 그리므로 반지름을 배율로 나눈다(네모 모서리가 틀 밖으로 삐져나오던 것)
              style={{ width: size.w, height: size.h, transform: `scale(${scale})`, borderRadius: `calc((var(--radius-medium) - 1px) / ${scale})` }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
