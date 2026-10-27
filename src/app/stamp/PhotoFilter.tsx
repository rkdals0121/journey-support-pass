"use client";

import { useEffect, useRef, useState } from "react";
import { Costume, FilterDeco } from "./art";

interface Props {
  role: string;
  /** 사진 아래 띠에 찍히는 글자. 예: "나의 비행 수첩 · 지우 · 기장 인증" */
  caption: string;
  onDone: (jpeg: string) => void;
  onCancel: () => void;
}

const W = 600;
const H = 800;

// 앞쪽 카메라에 필터 옷을 얹어 보여 주고, 찍으면 사진과 옷을 한 장(JPEG)으로 합친다.
// ponytail: 얼굴을 따라가지 않는 고정 틀이다. 점선 동그라미에 얼굴을 맞추게 한다. 얼굴 인식 필터는 실제 도입 때 검토.
export function PhotoFilter({ role, caption, onDone, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"starting" | "live" | "nocamera">("starting");
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
      } catch {
        if (!stopped) setState("nocamera");
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      if (!stopped) setState("live");
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function finish(source: CanvasImageSource, sw: number, sh: number, mirror: boolean) {
    setBusy(true);
    try {
      onDone(await compose(source, sw, sh, mirror, overlayRef.current!, caption));
    } catch {
      setBusy(false);
    }
  }

  // 3, 2, 1 세고 찍는다. 아이가 자세를 잡을 시간을 준다.
  function shoot() {
    if (busy || count) return;
    let n = 3;
    setCount(n);
    const t = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n > 0) return;
      clearInterval(t);
      const v = videoRef.current!;
      void finish(v, v.videoWidth, v.videoHeight, true);
    }, 800);
  }

  async function fromFile(file: File) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    try {
      img.src = url;
      await img.decode();
      await finish(img, img.naturalWidth, img.naturalHeight, false);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="sb-camera">
      <div className="sb-camera-frame">
        {state === "nocamera" ? (
          <p className="sb-camera-none">카메라를 켤 수 없어요.<br />아래 「사진 고르기」로 찍어 주세요.</p>
        ) : (
          <video ref={videoRef} playsInline muted aria-hidden="true" />
        )}
        <svg ref={overlayRef} viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" className="sb-overlay" aria-hidden="true">
          <FilterDeco role={role} />
          <Costume role={role} />
        </svg>
        <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" className="sb-overlay" aria-hidden="true">
          <ellipse cx="150" cy="195" rx="66" ry="84" fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="8 8" opacity=".8" />
        </svg>
        {count > 0 && <span className="sb-count" aria-live="assertive">{count}</span>}
      </div>
      <p className="sb-camera-hint">점선 동그라미에 얼굴을 맞춰 주세요</p>
      <div className="sb-actions">
        <button type="button" className="sb-btn sb-btn-main" onClick={shoot} disabled={state !== "live" || busy || count > 0}>
          {busy ? "사진 만드는 중…" : "찰칵! 찍기"}
        </button>
        <div className="sb-row">
          <button type="button" className="sb-btn sb-btn-line" onClick={() => fileRef.current?.click()} disabled={busy}>사진 고르기</button>
          <button type="button" className="sb-btn sb-btn-line" onClick={onCancel} disabled={busy}>돌아가기</button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        aria-label="사진 고르기"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void fromFile(f);
        }}
      />
    </div>
  );
}

/** 사진(가운데를 3:4 로 자름) + 필터 옷 + 아래 글자 띠를 600×800 JPEG 로 합친다. */
async function compose(src: CanvasImageSource, sw: number, sh: number, mirror: boolean, overlay: SVGSVGElement, caption: string) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const scale = Math.max(W / sw, H / sh);
  const cw = W / scale;
  const ch = H / scale;
  ctx.save();
  if (mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
  ctx.restore();

  const svg = overlay.cloneNode(true) as SVGSVGElement;
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  await img.decode();
  ctx.drawImage(img, 0, 0, W, H);

  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillRect(0, H - 56, W, 56);
  ctx.fillStyle = "#fff";
  ctx.font = "700 24px 'Pretendard Variable', Pretendard, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(caption, W / 2, H - 28, W - 40);
  return c.toDataURL("image/jpeg", 0.82);
}
