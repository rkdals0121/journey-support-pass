"use client";

import { SwitchCamera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Banner } from "./Alert";

interface Props {
  /**
   * QR 에서 읽은 글자. 같은 QR 을 계속 비추고 있으면 한 번만 올리고, 그래도 계속 들고 있으면 10초에 한 번 다시 올린다.
   * 2초 넘게 안 보였다가 다시 보이면 곧바로 다시 올린다.
   */
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

type JsQr = typeof import("jsqr").default;

const SCAN_INTERVAL_MS = 200;
const REPEAT_GUARD_MS = 2000;
// 같은 QR 을 계속 들고 있을 때 다시 올리는 간격. 연결이 잠깐 끊겨 확인하지 못한 QR 도 이만큼 지나면 다시 확인한다.
// 오류 글이 떠 있는 시간(안내 키오스크 6초)보다 길어야 글이 깜빡이지 않는다.
const HOLD_MAX_MS = 10000;
// QR 을 올리고 이만큼 안에 멈추면 그 QR 을 확인하느라 멈춘 것으로 본다.
const PAUSE_AFTER_SCAN_MS = 1000;
// jsQR 조각을 못 받아 왔을 때 다시 받아 오는 간격.
const JSQR_RETRY_MS = 10000;
const FRAME_MAX = 960;
// 가운데를 잘라 읽을 때 짧은 변에서 쓰는 비율. 화면의 겨누는 네모보다 조금 넓다.
const CENTER_PART = 0.72;
// 고른 카메라는 쓰임새(화면 쪽 / 뒤쪽)마다 따로 기억한다. 한데 두면 같은 태블릿의 안내데스크 화면에서 뒤쪽 카메라를 고른 뒤
// 키오스크 화면도 뒤쪽 카메라로 열린다.
const cameraKey = (prefer: string) => `jsp:camera:${prefer}`;

// 앱 설치 없이 브라우저 카메라로 읽는다.
// 기기에 QR 판독 기능(BarcodeDetector)이 있으면 먼저 쓰고, 못 읽으면 같은 장면을 jsQR 로 다시 읽는다.
export function Scanner({ onScan, paused = false, prefer = "environment", text }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const [cameraError, setCameraError] = useState(false);
  // 카메라 영상이 실제로 나오고 QR 을 읽을 준비까지 되었는지. 안 될 때 카메라가 안 켜진 것인지, 켜졌는데 못 읽는 것인지 화면에서 구분된다.
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
      setChosen(localStorage.getItem(cameraKey(prefer)));
    } catch {
      // 저장소를 못 쓰는 브라우저에서는 매번 기본 카메라로 시작한다.
    }
    setReady(true);
  }, [prefer]);

  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    // at: 마지막으로 보인 시각, sent: 마지막으로 올린 시각(그 QR 을 확인하느라 멈췄으면 확인이 끝난 시각).
    let last = { text: "", at: 0, sent: 0 };
    let center = false;
    setLive(false);

    const emit = (value: string) => {
      const now = Date.now();
      // 보일 때마다 시각을 새로 적는다. 막힌 QR(지워진 패스 등)을 여객이 계속 들고 있어도 2초마다 다시 확인하지 않는다.
      // 다시 확인하면 오류 글이 깜빡이고 화면이 들썩이며, 읽어 주던 오류 안내도 처음부터 다시 시작된다.
      // 그렇다고 끝없이 막아 두지는 않는다. 올린 지 10초가 지나면 다시 올린다. 연결이 잠깐 끊겨 확인하지 못한 QR 을
      // 여객이 그대로 들고 있으면, 연결이 돌아온 뒤에 다시 확인해야 하기 때문이다.
      const repeat = value === last.text && now - last.at < REPEAT_GUARD_MS && now - last.sent < HOLD_MAX_MS;
      last = { text: value, at: now, sent: repeat ? last.sent : now };
      if (repeat) return;
      // 읽었다는 것을 손으로 알 수 있게 한다. 지원하지 않는 기기에서는 아무 일도 없다.
      navigator.vibrate?.(80);
      onScanRef.current(value);
    };

    // jsQR 은 따로 받아 오는 조각이라, 공항 와이파이가 약하면 이 요청 하나만 실패할 수 있다.
    // 그래도 읽기를 멈추지 않는다. 기기 기능이 있으면 그것으로 읽고, jsQR 은 조금 뒤에 다시 받아 온다.
    // 카메라를 켜는 동안 미리 받아 오기 시작해, 기기 기능이 없는 기기도 대개 카메라가 켜질 때쯤에는 읽을 수 있다.
    let jsQR: JsQr | null = null;
    let jsQRTriedAt = 0;
    const loadJsQr = () => {
      jsQRTriedAt = Date.now();
      return import("jsqr")
        .then((m) => {
          jsQR = m.default;
        })
        .catch(() => {});
    };
    void loadJsQr();

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
          // 기억해 둔 카메라가 없어졌거나 조건이 맞지 않으면 먼저 쓰임새에 맞는 쪽(화면 쪽 / 뒤쪽)을, 그것도 안 되면 아무 카메라나 연다.
          try {
            stream = await open({ facingMode: prefer, ...size });
          } catch {
            stream = await open(size);
          }
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
      // 카메라를 켜는 사이에 화면을 떠났으면 읽기를 시작하지 않는다. 여기부터 읽기 시작까지는 기다리는 곳이 없다.
      if (stopped) return;

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
      // jsQR 을 기다리지 않고 곧바로 읽기 시작한다. 공항 와이파이가 느리면 jsQR 이 한참 늦게 올 수 있는데,
      // 그동안에도 기기 기능이 있는 기기는 읽을 수 있어야 한다. jsQR 은 받아 오는 대로 다음 장면부터 쓴다.

      // 읽을 방법이 하나도 없으면(jsQR 을 못 받아 왔고 기기 기능도 없으면) 「카메라가 켜졌습니다」를 띄우지 않는다.
      // 여객이 읽히지도 않는 QR 을 계속 들고 서 있지 않도록, 다시 받아 올 때까지 「켜는 중」으로 둔다.
      let canRead = false;
      const showLive = () => {
        const can = !!detector || !!jsQR;
        if (can === canRead) return;
        canRead = can;
        setLive(can);
      };
      showLive();

      let working = false;
      timer = setInterval(async () => {
        // 확인하는 동안에도 같은 QR 을 계속 보고 있는 것으로 친다. 확인이 늦게 끝나도 들고 있던 QR 을 곧바로 다시 올리지 않는다.
        if (pausedRef.current) {
          const now = Date.now();
          // 올리자마자 멈췄으면 그 QR 을 확인하느라 멈춘 것이다. 그때는 10초도 확인이 끝난 때부터 센다.
          // 확인은 연결이 나쁘면 15초까지 걸린다. 올린 때부터 세면 확인이 끝나자마자 다시 올려서,
          // 여객이 「연결할 수 없습니다」 같은 오류 글을 읽기도 전에 지워 버린다.
          // 다른 일로 멈춘 것(번호로 찾는 중 등)이면 늘리지 않는다.
          if (now - last.sent < PAUSE_AFTER_SCAN_MS) last.sent = now;
          last.at = now;
          return;
        }
        // 앞 장면을 아직 읽는 중이면 건너뛴다. 느린 기기에서 일이 쌓이지 않게 한다.
        if (working || video.readyState < 2 || video.videoWidth === 0) return;
        working = true;
        try {
          showLive();
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
          if (!jsQR) {
            if (Date.now() - jsQRTriedAt >= JSQR_RETRY_MS) void loadJsQr();
            return;
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
      localStorage.setItem(cameraKey(prefer), next);
    } catch {
      // 기억하지 못해도 이번에는 바꾼다.
    }
    setChosen(next);
  }

  if (cameraError) return <Banner role="status">{text.none}</Banner>;

  return (
    <div className="scan">
      <div className={`scanner ${mirror ? "mirror" : ""} ${paused ? "paused" : ""}`}>
        <video ref={videoRef} playsInline muted aria-hidden="true" />
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
