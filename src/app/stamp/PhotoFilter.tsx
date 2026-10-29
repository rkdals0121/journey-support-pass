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
// 얼굴 인식(MediaPipe Face Detector). 라이브러리는 npm 판과 같은 판의 wasm 을, 모델은 공식 저장소에서 받는다.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
// 옷 그림(art.tsx 의 Costume)은 두 눈 사이 가운데가 (150,190), 얼굴 폭이 150 이라고 보고 그렸다.
// ponytail: 맞춤 값. 실제 아이 얼굴로 찍어 보고 모자가 뜨거나 묻히면 이 셋만 고친다.
const FIT = { eyeX: 150, eyeY: 190, faceW: 150 };
// 옷 그림을 그릴 범위(Costume 좌표). 모자 꼭대기와 길게 내린 몸통이 다 들어가게 넉넉히 잡는다.
const BOX = { x: -150, y: -150, w: 600, h: 1200 };
// 얼굴을 놓친 뒤에도 이만큼은 마지막 자리에 옷을 둔다. 고개를 잠깐 돌려도 옷이 깜빡이지 않는다.
const HOLD_MS = 600;

interface Pose { x: number; y: number; s: number; a: number }
type Detector = { detectForVideo(src: CanvasImageSource, ts: number): { detections: { boundingBox?: { width: number }; keypoints: { x: number; y: number }[] }[] }; close(): void };
type Art = { costume: HTMLImageElement; deco: HTMLImageElement };

/** 얼굴을 찾지 못할 때 쓰는 자리: 화면 가운데 점선 동그라미. 예전 고정 틀과 같은 위치·크기다. */
const GUIDE: Pose = { x: W / 2, y: (H * 190) / 400, s: W / 300, a: 0 };

// 앞 카메라 영상에서 얼굴을 찾아, 얼굴 위치·크기·기울기에 맞춰 모자와 옷을 입혀 그린다.
// 얼굴 인식을 못 불러오면(인터넷이 약하거나 기기가 못 돌리면) 점선 동그라미에 얼굴을 맞추는 고정 틀로 돈다.
export function PhotoFilter({ role, caption, onDone, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const costumeRef = useRef<SVGSVGElement>(null);
  const decoRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const detectorRef = useRef<Detector | null>(null);
  const imgs = useRef<Art | null>(null);
  const loopOn = useRef(true);
  const [cam, setCam] = useState<"starting" | "live" | "none">("starting");
  const [ai, setAi] = useState<"loading" | "ready" | "off">("loading");
  const [face, setFace] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  // 옷과 장식 SVG 를 그림으로 바꿔 둔다. 캔버스에 매 장면 그려 넣는다.
  useEffect(() => {
    let alive = true;
    Promise.all([toImage(costumeRef.current!), toImage(decoRef.current!)]).then(([costume, deco]) => {
      if (alive) imgs.current = { costume, deco };
    });
    return () => {
      alive = false;
    };
  }, [role]);

  // 얼굴 인식 준비. 휴대전화 GPU 를 먼저 쓰고, 안 되면 CPU 로.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
        const files = await FilesetResolver.forVisionTasks(WASM);
        const make = (delegate: "GPU" | "CPU") =>
          FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", minDetectionConfidence: 0.5 });
        const d = await make("GPU").catch(() => make("CPU"));
        if (!alive) return d.close();
        detectorRef.current = d as unknown as Detector;
        setAi("ready");
      } catch {
        if (alive) setAi("off");
      }
    })();
    return () => {
      alive = false;
      detectorRef.current?.close();
      detectorRef.current = null;
    };
  }, []);

  // 카메라를 켜고 매 장면 그린다.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let pose: Pose | null = null;
    let seenAt = 0;
    let lastTs = 0;
    let hadFace = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      } catch {
        if (!stopped) setCam("none");
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      if (stopped) return;
      setCam("live");
      const ctx = canvasRef.current!.getContext("2d")!;
      const tick = () => {
        if (stopped) return;
        raf = requestAnimationFrame(tick);
        if (!loopOn.current || v.readyState < 2 || !v.videoWidth) return;
        // 인식기는 시각이 늘 늘어나야 받는다.
        lastTs = Math.max(performance.now(), lastTs + 1);
        const found = detectorRef.current ? findFace(detectorRef.current, v, v.videoWidth, v.videoHeight, true, lastTs) : null;
        if (found) {
          // 흔들림을 줄이려고 앞 장면과 섞는다.
          pose = pose ? mix(pose, found, 0.45) : found;
          seenAt = lastTs;
        } else if (lastTs - seenAt > HOLD_MS) pose = null;
        if (!!pose !== hadFace) setFace((hadFace = !!pose));
        draw(ctx, v, v.videoWidth, v.videoHeight, true, pose ?? (detectorRef.current ? null : GUIDE), imgs.current);
      };
      tick();
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [role]);

  function finish() {
    loopOn.current = false;
    setBusy(true);
    try {
      onDone(withCaption(canvasRef.current!, caption));
    } catch {
      loopOn.current = true;
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
      finish();
    }, 800);
  }

  // 고른 사진에도 같은 방법으로 얼굴을 찾아 옷을 입힌다.
  async function fromFile(file: File) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    loopOn.current = false;
    setBusy(true);
    try {
      img.src = url;
      await img.decode();
      const d = detectorRef.current;
      const pose = d ? findFace(d, img, img.naturalWidth, img.naturalHeight, false, performance.now() + 1e7) : null;
      draw(canvasRef.current!.getContext("2d")!, img, img.naturalWidth, img.naturalHeight, false, pose ?? GUIDE, imgs.current);
      onDone(withCaption(canvasRef.current!, caption));
    } catch {
      loopOn.current = true;
      setBusy(false);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const hint =
    cam === "none" ? "" :
    ai === "loading" ? "얼굴 인식을 준비하고 있어요…" :
    ai === "off" ? "점선 동그라미에 얼굴을 맞춰 주세요" :
    face ? "좋아요! 찰칵 버튼을 눌러요" : "얼굴이 화면에 보이게 해 주세요";

  return (
    <div className="sb-camera">
      <div className="sb-camera-frame">
        <video ref={videoRef} playsInline muted aria-hidden="true" className="sb-camera-src" />
        <canvas ref={canvasRef} width={W} height={H} role="img" aria-label="필터를 입힌 카메라 화면" />
        {cam === "none" && <p className="sb-camera-none">카메라를 켤 수 없어요.<br />아래 「사진 고르기」로 찍어 주세요.</p>}
        {cam === "live" && ai === "off" && (
          <svg viewBox="0 0 300 400" className="sb-overlay" aria-hidden="true">
            <ellipse cx="150" cy="195" rx="66" ry="84" fill="none" stroke="var(--color-surface)" strokeWidth="2.5" strokeDasharray="8 8" opacity=".8" />
          </svg>
        )}
        {count > 0 && <span className="sb-count" aria-live="assertive">{count}</span>}
      </div>
      <p className="sb-camera-hint" aria-live="polite">{hint}</p>
      <div className="sb-actions">
        <button type="button" className="sb-btn sb-btn-main" onClick={shoot} disabled={cam !== "live" || busy || count > 0}>
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
      {/* 캔버스에 그릴 원본 그림. 화면에는 보이지 않는다. */}
      <svg ref={costumeRef} xmlns="http://www.w3.org/2000/svg" viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`} width={BOX.w} height={BOX.h} className="sb-hidden-art" aria-hidden="true">
        <Costume role={role} />
      </svg>
      <svg ref={decoRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width={W} height={H} className="sb-hidden-art" aria-hidden="true">
        <FilterDeco role={role} />
      </svg>
    </div>
  );
}

/** 사진의 가운데 3:4 를 잘라 캔버스에 맞추는 값. */
function crop(sw: number, sh: number) {
  const k = Math.max(W / sw, H / sh);
  return { k, sx: (sw - W / k) / 2, sy: (sh - H / k) / 2 };
}

/** 가장 큰 얼굴을 찾아 캔버스 좌표의 자리·크기·기울기로 바꾼다. 거울 화면이면 좌우를 뒤집는다. */
function findFace(d: Detector, src: CanvasImageSource, sw: number, sh: number, mirror: boolean, ts: number): Pose | null {
  let res;
  try {
    res = d.detectForVideo(src, ts);
  } catch {
    return null;
  }
  const best = res.detections
    .filter((f) => f.boundingBox && f.keypoints.length >= 2)
    .sort((a, b) => b.boundingBox!.width - a.boundingBox!.width)[0];
  if (!best) return null;
  const { k, sx, sy } = crop(sw, sh);
  const at = (p: { x: number; y: number }) => {
    const x = (p.x * sw - sx) * k;
    return { x: mirror ? W - x : x, y: (p.y * sh - sy) * k };
  };
  const [e1, e2] = [at(best.keypoints[0]), at(best.keypoints[1])].sort((a, b) => a.x - b.x);
  return {
    x: (e1.x + e2.x) / 2,
    y: (e1.y + e2.y) / 2,
    s: (best.boundingBox!.width * k) / FIT.faceW,
    a: Math.atan2(e2.y - e1.y, e2.x - e1.x),
  };
}

const mix = (a: Pose, b: Pose, t: number): Pose => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: a.s + (b.s - a.s) * t, a: a.a + (b.a - a.a) * t });

/** 사진 + (찾은 얼굴에 맞춘) 옷 + 장식을 그린다. pose 가 없으면 옷 없이 사진과 장식만. */
function draw(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, mirror: boolean, pose: Pose | null, art: Art | null) {
  const { k, sx, sy } = crop(sw, sh);
  ctx.save();
  if (mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, sx, sy, W / k, H / k, 0, 0, W, H);
  ctx.restore();
  if (!art) return;
  if (pose) {
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.a);
    ctx.scale(pose.s, pose.s);
    ctx.translate(-FIT.eyeX, -FIT.eyeY);
    ctx.drawImage(art.costume, BOX.x, BOX.y, BOX.w, BOX.h);
    ctx.restore();
  }
  ctx.drawImage(art.deco, 0, 0, W, H);
}

/** 캔버스 그림 아래에 글자 띠를 얹어 JPEG 로. 화면의 캔버스는 건드리지 않는다. */
function withCaption(src: HTMLCanvasElement, caption: string) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.fillStyle = cssColor("--color-dark");
  ctx.fillRect(0, H - 56, W, 56);
  ctx.fillStyle = cssColor("--color-surface");
  ctx.font = "700 24px 'Pretendard Variable', Pretendard, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(caption, W / 2, H - 28, W - 40);
  return c.toDataURL("image/jpeg", 0.82);
}

function cssColor(token: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}
function toImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const theme = getComputedStyle(document.documentElement);
  for (const token of Array.from(theme).filter(k => k.startsWith("--color-"))) {
    clone.style.setProperty(token, theme.getPropertyValue(token));
  }
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  return img.decode().then(() => img);
}
