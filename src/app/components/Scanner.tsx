"use client";

import { useEffect, useRef, useState } from "react";
import { Banner } from "./Alert";

interface Props {
  /** QR 에서 읽은 글자. 같은 값은 2초 안에 다시 올리지 않는다. */
  onScan: (text: string) => void;
  /** 주면 카메라 아래에 패스 번호 입력란을 둔다. */
  onNumber?: (passNo: string) => void;
  /** 패스 번호 옆 버튼의 글자. */
  numberLabel?: string;
  paused?: boolean;
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

const SCAN_INTERVAL_MS = 250;
const REPEAT_GUARD_MS = 2000;
const FRAME_MAX = 800;

// 앱 설치 없이 브라우저 카메라로 읽는다. BarcodeDetector 가 없는 브라우저(iOS Safari 등)는 jsQR 로 읽는다.
export function Scanner({ onScan, onNumber, numberLabel = "열기", paused = false }: Props) {
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
      // 읽었다는 것을 손으로 알 수 있게 한다. 지원하지 않는 기기에서는 아무 일도 없다.
      navigator.vibrate?.(80);
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
        setCameraError(
          "카메라를 쓸 수 없습니다. 카메라가 없는 컴퓨터이거나 브라우저에서 카메라 권한을 허용하지 않았습니다. 패스 번호를 입력해 주세요.",
        );
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
          // 카메라 원본(수백만 화소)을 그대로 읽으면 휴대전화에서 한 장에 1초 가까이 걸려 놓친다.
          // 긴 변을 FRAME_MAX 로 줄여 읽는다. 패스 QR 은 이 크기에서도 충분히 읽힌다.
          const scale = Math.min(1, FRAME_MAX / Math.max(video.videoWidth, video.videoHeight));
          const canvas = canvasRef.current!;
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR!(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
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
        <Banner role="status">{cameraError}</Banner>
      ) : (
        <div className="scanner">
          <video ref={videoRef} playsInline muted aria-label="QR 스캔 카메라" />
          <canvas ref={canvasRef} hidden />
        </div>
      )}
      {!cameraError && (
        <p className="muted small scan-hint" aria-live="polite">
          {paused ? "확인하는 중…" : "자동으로 읽습니다. 20~30cm 거리가 알맞습니다."}
        </p>
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
          {!cameraError && <p className="or-line">카메라가 안 되면</p>}
          <label htmlFor="pass-no">패스 번호 네 자리</label>
          <div className="row">
            <input
              id="pass-no"
              className="input-code"
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="off"
              placeholder="0000"
              value={passNo}
              onChange={(e) => setPassNo(e.target.value.replace(/\D/g, ""))}
            />
            <button className="btn btn-primary btn-inline" disabled={passNo.length !== 4 || paused}>
              {numberLabel}
            </button>
          </div>
          <p className="hint">패스 뒷면 QR 아래에 인쇄된 번호입니다.</p>
        </form>
      )}
    </div>
  );
}
