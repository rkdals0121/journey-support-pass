"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** QR 에서 읽은 글자. 같은 값은 2초 안에 다시 올리지 않는다. */
  onScan: (text: string) => void;
  /** 주면 카메라 아래에 패스 번호 입력란을 둔다. */
  onNumber?: (passNo: string) => void;
  paused?: boolean;
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

const SCAN_INTERVAL_MS = 250;
const REPEAT_GUARD_MS = 2000;

// 앱 설치 없이 브라우저 카메라로 읽는다. BarcodeDetector 가 없는 브라우저(iOS Safari 등)는 jsQR 로 읽는다.
export function Scanner({ onScan, onNumber, paused = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [passNo, setPassNo] = useState("");

  onScanRef.current = onScan;
  pausedRef.current = paused;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let last = { text: "", at: 0 };

    const emit = (text: string) => {
      const now = Date.now();
      if (text === last.text && now - last.at < REPEAT_GUARD_MS) return;
      last = { text, at: now };
      onScanRef.current(text);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("이 기기에서는 카메라를 쓸 수 없습니다.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        setCameraError("카메라를 쓸 수 없습니다. 패스 번호를 입력해 주세요.");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector })
        .BarcodeDetector;
      const detector = Native ? new Native({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;

      timer = setInterval(async () => {
        if (pausedRef.current || video.readyState < 2) return;
        try {
          if (detector) {
            const found = await detector.detect(video);
            if (found[0]?.rawValue) emit(found[0].rawValue);
            return;
          }
          const canvas = canvasRef.current!;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(video, 0, 0);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR!(image.data, image.width, image.height);
          if (code?.data) emit(code.data);
        } catch {
          // 한 프레임을 못 읽은 것은 무시한다.
        }
      }, SCAN_INTERVAL_MS);
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div>
      {cameraError ? (
        <p className="notice" role="status">
          {cameraError}
        </p>
      ) : (
        <div className="scanner">
          <video ref={videoRef} playsInline muted aria-label="QR 스캔 카메라" />
          <canvas ref={canvasRef} hidden />
        </div>
      )}

      {onNumber && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{4}$/.test(passNo)) {
              onNumber(passNo);
              setPassNo("");
            }
          }}
        >
          <label htmlFor="pass-no">패스 번호 네 자리</label>
          <div className="row">
            <input
              id="pass-no"
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="off"
              value={passNo}
              onChange={(e) => setPassNo(e.target.value.replace(/\D/g, ""))}
            />
            <button className="btn btn-inline" disabled={passNo.length !== 4}>
              열기
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
