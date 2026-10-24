"use client";

import { Camera, CircleCheck, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { classify, judge, type Scan, type Target, type Verdict } from "@/lib/docscan";
import type { Text } from "@/lib/i18n";

// 글자 인식기(tesseract.js)는 처음 쓸 때 받는다(영어 약 4MB, 한국어 약 10MB). 한 번 받으면 이 화면을 쓰는 동안 다시 쓴다.
// 인식은 이 기기 안의 작업자(web worker)에서 한다. 사진과 읽은 글자는 어디에도 보내지 않는다.
type Worker = { recognize(image: Blob | HTMLCanvasElement): Promise<{ data: { text: string } }> };
const workers = new Map<string, Promise<Worker>>();
function workerFor(lang: "eng" | "kor"): Promise<Worker> {
  let w = workers.get(lang);
  if (!w) {
    w = import("tesseract.js").then((t) => t.createWorker(lang) as unknown as Promise<Worker>);
    // 받지 못했으면 다음에 다시 받게 지운다.
    w.catch(() => workers.delete(lang));
    workers.set(lang, w);
  }
  return w;
}

/** 사진을 인식하기 좋게 줄인다. 큰 사진을 그대로 넣으면 느린 휴대전화에서 수십 초가 걸린다. */
async function toCanvas(image: Blob | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  if (image instanceof HTMLCanvasElement) return image;
  const bmp = await createImageBitmap(image);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/**
 * 사진을 읽어 서류를 판정한다. 여권 기계판독줄은 영어 인식기가 더 잘 읽어 먼저 해 보고,
 * 여권이 아니면 한국어 인식기로 다시 읽는다(복지카드, 산모수첩, 가족관계증명서).
 */
async function read(image: Blob | HTMLCanvasElement, target: Target): Promise<{ scan: Scan | null; verdict: Verdict }> {
  const today = new Date();
  const canvas = await toCanvas(image);
  const eng = await (await workerFor("eng")).recognize(canvas);
  let scan = classify(eng.data.text, today);
  if (!scan || scan.kind !== "passport") {
    const kor = await (await workerFor("kor")).recognize(canvas);
    scan = classify(kor.data.text, today) ?? scan;
  }
  return { scan, verdict: judge(target, scan, today) };
}

type State = { kind: "idle" } | { kind: "confirmed" } | { kind: "reading" } | { kind: "done"; scan: Scan | null; verdict: Verdict } | { kind: "error" };

interface Props {
  target: Target;
  t: Text;
  /** 휴대전화는 사진을 찍거나 고른다. 키오스크는 화면 쪽 카메라로 찍는다. */
  mode: "phone" | "kiosk";
  /** 판정이 바뀔 때마다 알린다(맞으면 참). */
  onResult: (ok: boolean) => void;
  /** 이미 확인된 서류(이전 단계로 갔다 돌아온 경우). 확인됨으로 보여 주고 다시 찍을 수 있게 한다. */
  confirmed?: boolean;
}

/** 증빙서류 한 장을 찍어 기기 안에서 인식한다. */
export function DocScan({ target, t, mode, onResult, confirmed = false }: Props) {
  const [state, setState] = useState<State>(confirmed ? { kind: "confirmed" } : { kind: "idle" });
  const seq = useRef(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  async function run(image: Blob | HTMLCanvasElement) {
    const mine = ++seq.current;
    setState({ kind: "reading" });
    onResultRef.current(false);
    try {
      const res = await read(image, target);
      if (mine !== seq.current) return;
      setState({ kind: "done", ...res });
      onResultRef.current(res.verdict.ok);
    } catch {
      if (mine === seq.current) setState({ kind: "error" });
    }
  }

  // 화면이 사라지면 늦게 끝난 인식은 버린다.
  useEffect(
    () => () => {
      seq.current++;
    },
    [],
  );

  const reset = () => {
    seq.current++;
    setState({ kind: "idle" });
    onResultRef.current(false);
  };

  return (
    <div className="docscan">
      {state.kind === "done" && (
        <p className={state.verdict.ok ? "docscan-msg ok" : "docscan-msg bad"} role="status">
          {state.verdict.ok ? <CircleCheck size={20} aria-hidden="true" /> : <CircleAlert size={20} aria-hidden="true" />}
          {state.verdict.ok ? t.scanOk(t.scanKind[state.scan!.kind]) : t.scanFail[state.verdict.reason]}
        </p>
      )}
      {state.kind === "confirmed" && (
        <p className="docscan-msg ok" role="status">
          <CircleCheck size={20} aria-hidden="true" />
          {t.scanConfirmed}
        </p>
      )}
      {state.kind === "error" && (
        <p className="docscan-msg bad" role="status">
          <CircleAlert size={20} aria-hidden="true" />
          {t.scanError}
        </p>
      )}
      {state.kind === "reading" ? (
        <p className="docscan-msg" role="status">
          <LoaderCircle size={20} className="spin" aria-hidden="true" />
          {t.scanReading}
        </p>
      ) : state.kind === "confirmed" || (state.kind === "done" && state.verdict.ok) ? (
        <button className="btn btn-ghost" onClick={reset}>
          <RotateCcw size={18} aria-hidden="true" />
          {t.scanAgain}
        </button>
      ) : mode === "phone" ? (
        <label className="btn proof-pick">
          <Camera size={20} aria-hidden="true" />
          {t.scanTake}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f) void run(f);
            }}
          />
        </label>
      ) : (
        <KioskCamera label={t.scanTake} onShot={(c) => void run(c)} />
      )}
    </div>
  );
}

/** 키오스크: 화면 쪽 카메라 영상을 보여 주고 「찍기」를 누르면 그 순간을 넘긴다. */
function KioskCamera({ label, onShot }: { label: string; onShot: (c: HTMLCanvasElement) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().then(() => setReady(true));
        }
      })
      .catch(() => setReady(false));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);
  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    onShot(c);
  };
  return (
    <div className="docscan-cam">
      <video ref={video} muted playsInline aria-hidden="true" />
      <button className="btn btn-primary" onClick={shoot} disabled={!ready}>
        <Camera size={22} aria-hidden="true" />
        {label}
      </button>
    </div>
  );
}
