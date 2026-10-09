"use client";

import { SwitchCamera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Banner } from "./Alert";

interface Props {
  /** QR 에서 읽은 글자. 같은 값은 2초 안에 다시 올리지 않는다. */
  onScan: (text: string) => void;
  /** 확인하는 동안에는 읽기를 멈춘다. */
  paused?: boolean;
  /**
   * 먼저 쓸 카메라. 키오스크는 화면 쪽 카메라(user)에 여객이 QR 을 보여 주고,
   * 직원 휴대전화는 뒤쪽 카메라(environment)로 여객의 QR 을 비춘다.
   */
  prefer?: "user" | "environment";
  text: { starting: string; ready: string; read: string; none: string; switchCamera: string };
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

const SCAN_INTERVAL_MS = 200;
const REPEAT_GUARD_MS = 2000;
const FRAME_MAX = 960;
// 가운데를 잘라 읽을 때 짧은 변에서 쓰는 비율. 화면의 겨누는 네모보다 조금 넓다.
const CENTER_PART = 0.72;
const CAMERA_KEY = "jsp:camera";

// 앱 설치 없이 브라우저 카메라로 읽는다.
// 기기에 QR 판독 기능(BarcodeDetector)이 있으면 먼저 쓰고, 못 읽으면 같은 장면을 jsQR 로 다시 읽는다.
export function Scanner({ onScan, paused = false, prefer = "environment", text }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const [cameraError, setCameraError] = useState(false);
  // 카메라 영상이 실제로 나오기 시작했는지. 안 될 때 카메라가 안 켜진 것인지, 켜졌는데 못 읽는 것인지 화면에서 구분된다.
  const [live, setLive] = useState(false);
  // 화면 쪽 카메라는 거울처럼 뒤집어 보여준다. 손을 움직이는 방향과 화면이 같아야 겨누기 쉽다.
  const [mirror, setMirror] = useState(false);
  const [cameras, setCameras] = useState<string[]>([]);
  // 골라 둔 카메라. null 이면 prefer 에 맞는 것을 브라우저가 고른다.
  const [chosen, setChosen] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  onScanRef.current = onScan;
  pausedRef.current = paused;

  // 지난번에 고른 카메라를 기억한다. 키오스크에 카메라가 둘이면 설치할 때 한 번만 고르면 된다.
  useEffect(() => {
    try {
      setChosen(localStorage.getItem(CAMERA_KEY));
    } catch {
      // 저장소를 못 쓰는 브라우저에서는 매번 기본 카메라로 시작한다.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let last = { text: "", at: 0 };
    let center = false;
    setLive(false);

    const emit = (value: string) => {
      const now = Date.now();
      if (value === last.text && now - last.at < REPEAT_GUARD_MS) return;
      last = { text: value, at: now };
      // 읽었다는 것을 손으로 알 수 있게 한다. 지원하지 않는 기기에서는 아무 일도 없다.
      navigator.vibrate?.(80);
      onScanRef.current(value);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(true);
        return;
      }
      // 해상도를 높게 청한다. 기본값(보통 640x480)으로는 스티커 QR 의 한 칸이 2~3화소밖에 안 되어 잘 읽히지 않는다.
      // 기기가 못 맞추면 가능한 가장 가까운 값으로 열린다.
      const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      const open = (video: MediaTrackConstraints) => navigator.mediaDevices.getUserMedia({ video, audio: false });
      try {
        try {
          stream = await open(chosen ? { deviceId: { exact: chosen }, ...size } : { facingMode: prefer, ...size });
        } catch {
          // 기억해 둔 카메라가 없어졌거나 조건이 맞지 않으면 아무 카메라나 연다.
          stream = await open(size);
        }
      } catch {
        setCameraError(true);
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setCameraError(false);
      const track = stream.getVideoTracks()[0];
      const facing = track?.getSettings().facingMode;
      // 방향을 알려 주지 않는 카메라(노트북, 키오스크의 웹캠)는 화면 쪽을 보고 있는 것으로 본다.
      setMirror(facing ? facing === "user" : true);
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (!stopped) setCameras(list.filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => d.deviceId));
        })
        .catch(() => {});

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (stopped) return;
      setLive(true);

      // 기기 기능은 있다고 나오지만 실제로는 동작하지 않는 휴대전화가 있다(오류를 내거나 늘 빈 값을 돌려준다).
      // 그런 기기에서도 읽히도록 jsQR 을 항상 준비해 두고, 기기 기능이 오류를 내면 그 뒤로는 쓰지 않는다.
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector })
        .BarcodeDetector;
      let detector: Detector | null = null;
      try {
        detector = Native ? new Native({ formats: ["qr_code"] }) : null;
      } catch {
        detector = null;
      }
      const jsQR = (await import("jsqr")).default;
      // 준비되는 사이에 화면을 떠났으면 읽기를 시작하지 않는다.
      if (stopped) return;

      let working = false;
      timer = setInterval(async () => {
        // 앞 장면을 아직 읽는 중이면 건너뛴다. 느린 기기에서 일이 쌓이지 않게 한다.
        if (working || pausedRef.current || video.readyState < 2 || video.videoWidth === 0) return;
        working = true;
        try {
          if (detector) {
            try {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) {
                emit(found[0].rawValue);
                return;
              }
            } catch {
              detector = null;
            }
          }
          // 두 가지로 번갈아 읽는다.
          //  - 가운데만 잘라 원래 해상도로: QR 을 조금 떨어져서 보여 줄 때. QR 이 화면에서 작아도 칸이 뭉개지지 않는다.
          //  - 전체를 줄여서: QR 을 가까이 대어 화면을 가득 채울 때.
          // 원본 전체(수백만 화소)를 그대로 읽으면 한 장에 1초 가까이 걸려 놓치므로 어느 쪽이든 FRAME_MAX 안으로 맞춘다.
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const canvas = canvasRef.current!;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          center = !center;
          if (center) {
            const side = Math.round(Math.min(vw, vh) * CENTER_PART);
            const out = Math.min(side, FRAME_MAX);
            canvas.width = out;
            canvas.height = out;
            ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, out, out);
          } else {
            const scale = Math.min(1, FRAME_MAX / Math.max(vw, vh));
            canvas.width = Math.round(vw * scale);
            canvas.height = Math.round(vh * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // 휴대전화 화면이 어두운 바탕(다크 모드)이면 QR 이 뒤집혀 보일 수 있어 양쪽을 다 본다.
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
          if (code?.data) emit(code.data);
        } catch {
          // 한 장면을 못 읽은 것은 무시한다.
        } finally {
          working = false;
        }
      }, SCAN_INTERVAL_MS);
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [ready, chosen, prefer]);

  function switchCamera() {
    if (cameras.length < 2) return;
    const video = videoRef.current;
    const current = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0]?.getSettings().deviceId ?? chosen;
    const next = cameras[(cameras.indexOf(current ?? "") + 1) % cameras.length];
    try {
      localStorage.setItem(CAMERA_KEY, next);
    } catch {
      // 기억하지 못해도 이번에는 바꾼다.
    }
    setChosen(next);
  }

  if (cameraError) return <Banner role="status">{text.none}</Banner>;

  return (
    <div className="scan">
      <div className={`scanner ${mirror ? "mirror" : ""} ${paused ? "paused" : ""}`}>
        <video ref={videoRef} playsInline muted aria-label="QR" />
        <canvas ref={canvasRef} hidden />
        <span className="scanner-frame" aria-hidden="true" />
        {cameras.length > 1 && (
          <button type="button" className="scanner-switch" onClick={switchCamera} aria-label={text.switchCamera}>
            <SwitchCamera size={22} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="scan-hint" aria-live="polite">
        <i className={`scan-dot ${live && !paused ? "on" : ""}`} aria-hidden="true" />
        {paused ? text.read : live ? text.ready : text.starting}
      </p>
    </div>
  );
}
