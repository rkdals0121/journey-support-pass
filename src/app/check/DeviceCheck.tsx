"use client";

import { Camera, CircleCheck, CircleHelp, CircleX, Globe, MonitorSmartphone, Volume2, WifiOff, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { extractToken } from "@/lib/pass-format";
import { Brand } from "../components/Sunflower";
import { Scanner } from "../components/Scanner";

type State = "ok" | "bad" | "warn" | "wait";

interface Row {
  state: State;
  text: string;
}

const ICON = { ok: CircleCheck, bad: CircleX, warn: CircleHelp, wait: CircleHelp };
const WORD = { ok: "됨", bad: "안 됨", warn: "확인 필요", wait: "확인 중" };

// 카카오톡·네이버·인스타그램·페이스북·라인 안에서 연 화면. 이 안에서는 인터넷 없이 여는 기능이 잘 안 된다.
const IN_APP = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i;
// 이 화면이 보여 주는 점검용 QR 의 주소 끝. 다른 기기의 이 화면에서 읽으면 "점검용 QR"이라고 알려 준다.
const CHECK_QR_RE = /\/CHECK\/?$/i;

function Item({ id, icon: Icon, title, row, children }: { id: string; icon: typeof Camera; title: string; row: Row; children?: React.ReactNode }) {
  const Mark = ICON[row.state];
  return (
    <section className={`dc-item dc-${row.state}`} aria-labelledby={`check-${id}`}>
      <h2 id={`check-${id}`}>
        <Icon size={22} aria-hidden="true" />
        <span>{title}</span>
        <b className="dc-mark">
          <Mark size={20} aria-hidden="true" />
          {WORD[row.state]}
        </b>
      </h2>
      <p aria-live="polite">{row.text}</p>
      {children}
    </section>
  );
}

/**
 * 기기 점검. 시연이나 설치 전에 그 기기에서 직접 연다.
 * 카메라 QR 읽기, 소리 안내(한국어·영어 목소리), 인터넷, 화면 크기, 인터넷 없이 고유 일련 번호 화면 열기, 화면 꺼짐 막기를 본다.
 * 아무것도 서버에 남기지 않는다. 인터넷 확인은 이 화면 주소를 한 번 더 묻는 것뿐이다.
 */
export function DeviceCheck() {
  const [net, setNet] = useState<Row>({ state: "wait", text: "인터넷 연결을 확인하는 중…" });
  const [screen, setScreen] = useState<Row>({ state: "wait", text: "화면 크기를 확인하는 중…" });
  const [offline, setOffline] = useState<Row>({ state: "wait", text: "확인하는 중…" });
  const [wake, setWake] = useState<Row>({ state: "wait", text: "확인하는 중…" });
  const [voice, setVoice] = useState<Row>({ state: "wait", text: "목소리를 확인하는 중…" });
  const [heard, setHeard] = useState(false);
  const [cam, setCam] = useState(false);
  const [scan, setScan] = useState<Row>({ state: "warn", text: "「카메라 켜기」를 누르고 QR을 네모 안에 보여 주세요." });
  const [qr, setQr] = useState("");
  const voices = useRef<SpeechSynthesisVoice[]>([]);

  // 인터넷: 이 화면 주소를 다시 받아 걸린 시간을 잰다. 받아 둔 것을 쓰지 않게 매번 새로 묻는다.
  // 한동안 아무도 열지 않은 서버는 첫 답이 1~2초 늦다(잠에서 깨는 시간). 그래서 한 번 먼저 깨우고 두 번째를 잰다.
  // 첫 번째가 실패하면 그대로 "닿지 않는다"로 본다.
  async function checkNet() {
    setNet({ state: "wait", text: "인터넷 연결을 확인하는 중…" });
    const ping = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(`/check?ping=${Date.now()}`, { method: "HEAD", cache: "no-store", signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      await ping();
      const started = performance.now();
      await ping();
      const ms = Math.round(performance.now() - started);
      setNet(
        ms < 1500
          ? { state: "ok", text: `연결되어 있습니다. 서버가 ${ms / 1000}초 만에 답했습니다.` }
          : { state: "warn", text: `연결은 되지만 느립니다(${(ms / 1000).toFixed(1)}초). 와이파이를 바꾸거나 휴대전화 데이터로 바꿔 보세요.` },
      );
    } catch {
      setNet({ state: "bad", text: "서버에 닿지 않습니다. 와이파이나 데이터 연결을 확인해 주세요." });
    }
  }

  useEffect(() => {
    void checkNet();

    const size = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // 화면이 아직 그려지지 않았으면(뒤에 숨은 탭) 크기가 0 으로 나온다. 보일 때 다시 잰다.
      if (w === 0 || h === 0) return;
      const ratio = window.devicePixelRatio || 1;
      const touch = navigator.maxTouchPoints > 0;
      const what = w >= 900 ? "태블릿·노트북 크기" : w >= 600 ? "작은 태블릿 크기" : "휴대전화 크기";
      setScreen({
        state: touch ? "ok" : "warn",
        text: `화면 ${w} × ${h} (${what}, 화소 배율 ${ratio}). ${touch ? "손가락으로 누를 수 있습니다." : "터치 화면이 아닙니다. 키오스크로 쓰려면 터치가 되는 기기가 좋습니다."}`,
      });
    };
    size();
    window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", size);

    const ua = navigator.userAgent;
    if (IN_APP.test(ua)) {
      setOffline({ state: "bad", text: "카카오톡 같은 앱 안에서 열렸습니다. 이 안에서는 인터넷 없이 열기가 잘 되지 않습니다. 크롬이나 사파리로 다시 열어 주세요." });
    } else if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      setOffline({ state: "bad", text: "이 브라우저는 고유 일련 번호 화면을 휴대전화에 남겨 두지 못합니다. 인터넷이 끊기면 QR이 열리지 않습니다." });
    } else {
      setOffline({ state: "ok", text: "고유 일련 번호 화면을 한 번 열어 두면 인터넷이 끊겨도 다시 열립니다." });
    }

    setWake(
      "wakeLock" in navigator
        ? { state: "ok", text: "고유 일련 번호 화면을 보는 동안에는 휴대전화 화면이 꺼지지 않습니다. 키오스크로 쓸 기기는 기기 설정에서 화면 자동 꺼짐을 꺼 두세요." }
        : { state: "warn", text: "이 브라우저는 화면 꺼짐을 막지 못합니다. 고유 일련 번호 화면을 보여 주는 동안 화면이 꺼질 수 있습니다. 키오스크로 쓸 기기는 기기 설정에서 화면 자동 꺼짐을 꺼 두세요." },
    );

    // 목소리 목록은 늦게 오는 브라우저가 있어 바뀔 때마다 다시 본다.
    const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
    const readVoices = () => {
      if (!synth) {
        setVoice({ state: "bad", text: "이 브라우저는 소리 안내(글 읽어 주기)를 하지 못합니다." });
        return;
      }
      const list = synth.getVoices();
      voices.current = list;
      const has = (code: string) => list.some((v) => v.lang.replace("_", "-").toLowerCase().startsWith(code));
      const ko = has("ko");
      const en = has("en");
      if (list.length === 0) {
        setVoice({ state: "warn", text: "목소리 목록을 아직 받지 못했습니다. 「소리 들어 보기」를 눌러 직접 들어 보세요." });
      } else if (ko && en) {
        setVoice({ state: "ok", text: "한국어와 영어 목소리가 있습니다. 「소리 들어 보기」로 실제로 들리는지 확인하세요." });
      } else {
        const missing = !ko && !en ? "한국어와 영어" : ko ? "영어" : "한국어";
        setVoice({
          state: "warn",
          text: `${missing} 목소리가 없습니다. 그 언어는 다른 목소리로 어색하게 읽거나 읽지 못할 수 있습니다. 기기 설정의 "텍스트 음성 변환(TTS)"에서 ${missing} 목소리를 내려받으세요.`,
        });
      }
    };
    readVoices();
    synth?.addEventListener?.("voiceschanged", readVoices);
    const late = setTimeout(readVoices, 1500);

    // 다른 기기로 읽어 볼 점검용 QR.
    import("qrcode")
      .then((m) => m.default.toString(`${window.location.origin}/check`.toUpperCase(), { type: "svg", errorCorrectionLevel: "M", margin: 4 }))
      .then(setQr)
      .catch(() => setQr(""));

    return () => {
      window.removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", size);
      synth?.removeEventListener?.("voiceschanged", readVoices);
      clearTimeout(late);
      synth?.cancel();
    };
  }, []);

  function speak(lang: "ko" | "en") {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const code = lang === "ko" ? "ko-KR" : "en-US";
    const u = new SpeechSynthesisUtterance(
      lang === "ko" ? "안녕하세요. 소리 안내가 잘 들리면 이 기기는 준비되었습니다." : "Hello. If you can hear this, voice guidance is ready.",
    );
    u.lang = code;
    const v = voices.current.find((x) => x.lang.replace("_", "-").startsWith(code.slice(0, 2)));
    if (v) u.voice = v;
    u.rate = 0.95;
    synth.speak(u);
    setHeard(true);
  }

  function onScan(text: string) {
    if (CHECK_QR_RE.test(text.trim())) {
      setScan({ state: "ok", text: "점검용 QR을 읽었습니다. 카메라로 QR 읽기가 됩니다." });
    } else if (extractToken(text)) {
      // 고유 일련 번호 화면의 QR 이다. 이 화면에서는 열지 않는다.
      setScan({ state: "ok", text: "고유 일련 번호 화면의 QR을 읽었습니다. 카메라로 QR 읽기가 됩니다." });
    } else {
      setScan({ state: "ok", text: "QR을 읽었습니다(이 서비스의 QR은 아닙니다). 카메라로 QR 읽기가 됩니다." });
    }
  }

  return (
    <div className="device-check">
      <Brand />
      <h1>기기 점검</h1>
      <p className="muted">
        키오스크로 쓸 태블릿이나 여객 역할 휴대전화에서 이 화면을 열어, 시연 전에 하나씩 확인합니다. 서버에는 아무것도 남기지 않습니다.
      </p>

      <Item id="net" icon={Globe} title="인터넷" row={net}>
        <button type="button" className="btn btn-inline" onClick={() => void checkNet()}>
          다시 확인
        </button>
      </Item>

      <Item id="cam" icon={Camera} title="카메라로 QR 읽기" row={scan}>
        {cam ? (
          <Scanner
            onScan={onScan}
            prefer="user"
            text={{
              starting: "카메라를 켜는 중…",
              ready: "카메라가 켜졌습니다. QR을 네모 안에 보여 주세요.",
              read: "QR을 읽었습니다.",
              none: "카메라를 쓸 수 없습니다. 브라우저의 카메라 권한을 허용했는지 확인해 주세요. 키오스크에서는 고유 일련 번호를 눌러 열 수 있습니다.",
              switchCamera: "다른 카메라로",
            }}
          />
        ) : (
          <button type="button" className="btn btn-inline" onClick={() => setCam(true)}>
            카메라 켜기
          </button>
        )}
        <p className="hint">
          읽어 볼 QR이 없으면 다른 휴대전화로 이 화면을 열고 아래 「점검용 QR」을 보여 주세요. 카메라가 둘이면 영상 위의 바꾸기 단추로 고르고, 고른 카메라는 키오스크에서도 그대로 씁니다.
        </p>
      </Item>

      <Item id="voice" icon={Volume2} title="소리 안내" row={voice}>
        <div className="dc-row">
          <button type="button" className="btn btn-inline" onClick={() => speak("ko")}>
            소리 들어 보기
          </button>
          <button type="button" className="btn btn-inline" onClick={() => speak("en")} lang="en">
            English voice
          </button>
        </div>
        {heard && <p className="hint">안 들리면 기기의 소리 크기와 무음(매너) 모드를 확인해 주세요. 아이폰·아이패드는 옆의 무음 스위치도 봅니다.</p>}
      </Item>

      <Item id="screen" icon={MonitorSmartphone} title="화면" row={screen} />
      <Item id="offline" icon={WifiOff} title="인터넷 없이 고유 일련 번호 화면 열기 (휴대전화)" row={offline} />
      <Item id="wake" icon={Sun} title="화면 꺼짐 막기" row={wake} />

      {qr && (
        <section className="dc-qr" aria-labelledby="check-qr">
          <h2 id="check-qr">점검용 QR</h2>
          <p className="hint">키오스크로 쓸 기기의 이 화면에서 「카메라 켜기」를 누른 뒤 이 QR을 보여 주세요.</p>
          <div dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label="점검용 QR" />
        </section>
      )}

      <p className="hint">
        스티커 인쇄는 등록 키오스크에서 등록을 마친 화면의 「스티커 뽑기」로 확인합니다.
      </p>
      <Link className="home-staff" href="/kiosk">
        키오스크 설치로
      </Link>
    </div>
  );
}
