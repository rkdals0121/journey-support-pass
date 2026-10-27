// 스탬프북 그림. 모두 손으로 그린 SVG 라 따로 받아 올 파일이 없다.
// 「뭉게」는 시안용 캐릭터다. 실제 적용 때는 인천공항 공식 마스코트로 바꾼다(구상안 7).
import type { ThemeId } from "@/lib/stamp-book";

const PLANE = "M50 18c3 0 5 3 5 7v17l24 14v7l-24-7v14l7 6v6l-12-4-12 4v-6l7-6V56l-24 7v-7l24-14V25c0-4 2-7 5-7z";
const STAR = "M50 8l11 27 29 2-22 19 7 28-25-15-25 15 7-28-22-19 29-2z";
const COMPASS = "M50 6l9 35 35 9-35 9-9 35-9-35-35-9 35-9z";

/** 뭉게: 비행기 꼬리를 단 구름 친구. svg 안에 넣는 g 모양(사진 필터는 svg 하나로 뽑아야 해서 겹쳐 넣지 않는다). */
function MonggeShape({ wink }: { wink: boolean }) {
  return (
    <>
      <ellipse cx="78" cy="92" rx="36" ry="12" fill="#f7b5cd" stroke="#2d2f4a" strokeWidth="4" />
      <path d="M128 52c10-14 18-16 20-14s0 16-8 30z" fill="#ffd84d" stroke="#2d2f4a" strokeWidth="4" strokeLinejoin="round" />
      <path d="M26 30l-12-10 4 18z" fill="#f7b5cd" stroke="#2d2f4a" strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 60c0-28 26-44 58-44s54 16 54 40-24 38-56 38-56-8-56-34z" fill="#fff" stroke="#2d2f4a" strokeWidth="5" />
      {wink ? (
        <>
          <path d="M52 54q7-8 14 0M92 54q7-8 14 0" fill="none" stroke="#2d2f4a" strokeWidth="5" strokeLinecap="round" />
          <path d="M66 68q13 14 26 0" fill="#e2577f" stroke="#2d2f4a" strokeWidth="4" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="60" cy="54" r="5" fill="#2d2f4a" />
          <circle cx="98" cy="54" r="5" fill="#2d2f4a" />
          <path d="M70 66q9 9 18 0" fill="none" stroke="#2d2f4a" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      <ellipse cx="46" cy="66" rx="8" ry="5" fill="#f7a1c0" />
      <ellipse cx="112" cy="66" rx="8" ry="5" fill="#f7a1c0" />
    </>
  );
}

export function Mongge({ size = 120, wink = false }: { size?: number; wink?: boolean }) {
  return (
    <svg viewBox="0 0 160 120" width={size} height={size * 0.75} aria-hidden="true">
      <MonggeShape wink={wink} />
    </svg>
  );
}

/** 표지와 인증 카드의 둥근 문장 */
export function Emblem({ theme, size = 112 }: { theme: ThemeId; size?: number }) {
  if (theme === "friend") return <Mongge size={size * 1.3} />;
  const line = theme === "flight" ? "#d9a441" : "#ead7aa";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke={line} strokeWidth="3" />
      <circle cx="50" cy="50" r="39" fill="none" stroke={line} strokeWidth="1" strokeDasharray="2 3" />
      {theme === "flight" ? (
        <path d={PLANE} fill={line} transform="translate(50 50) rotate(45) scale(.62) translate(-50 -50)" />
      ) : (
        <>
          <path d={COMPASS} fill={line} transform="translate(50 50) scale(.78) translate(-50 -50)" />
          <circle cx="50" cy="50" r="5" fill="#3c5a3c" />
        </>
      )}
    </svg>
  );
}

/** 찍힌 도장 */
export function StampMark({ theme, size = 56 }: { theme: ThemeId; size?: number }) {
  if (theme === "friend")
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="#ff9fbd" stroke="#2d2f4a" strokeWidth="5" />
        <path d={STAR} fill="#ffd84d" stroke="#2d2f4a" strokeWidth="5" strokeLinejoin="round" transform="translate(50 52) scale(.62) translate(-50 -50)" />
      </svg>
    );
  const ink = theme === "flight" ? "#c23b32" : "#8a3a2c";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="#fbf3e4" />
      <circle cx="50" cy="50" r="44" fill="none" stroke={ink} strokeWidth="4" />
      <circle cx="50" cy="50" r="36" fill="none" stroke={ink} strokeWidth="1.5" />
      {theme === "flight" ? (
        <path d={PLANE} fill={ink} transform="translate(50 50) rotate(45) scale(.6) translate(-50 -50)" />
      ) : (
        <path d={COMPASS} fill={ink} transform="translate(50 50) rotate(20) scale(.66) translate(-50 -50)" />
      )}
    </svg>
  );
}

/** 사진을 찍기 전 완성 화면에 보여 줄 그림. 고른 필터의 옷을 입은 아이. */
export function Portrait({ role }: { role: string }) {
  return (
    <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" className="sb-art" aria-hidden="true">
      <Backdrop role={role} />
      <circle cx="150" cy="190" r="72" fill="#f2c8a0" />
      <path d="M78 196q-4-84 72-86t72 86q-16-44-72-48-56 4-72 48z" fill="#3b2a20" />
      <circle cx="124" cy="190" r="7" fill="#2d2f4a" />
      <circle cx="176" cy="190" r="7" fill="#2d2f4a" />
      <path d="M128 222q22 18 44 0" fill="none" stroke="#2d2f4a" strokeWidth="6" strokeLinecap="round" />
      <rect x="132" y="250" width="36" height="50" fill="#f2c8a0" />
      <Costume role={role} />
    </svg>
  );
}

function Backdrop({ role }: { role: string }) {
  if (role === "explorer")
    return (
      <>
        <rect width="300" height="400" fill="#cfe6d6" />
        <circle cx="240" cy="70" r="30" fill="#f4d466" />
        <path d="M-20 300l90-150 90 150zM130 300l90-140 100 140z" fill="#8fb79a" />
      </>
    );
  if (role === "friend")
    return (
      <>
        <rect width="300" height="400" fill="#cde7ff" />
        <Rainbow />
      </>
    );
  return (
    <>
      <rect width="300" height="400" fill="#bcd7f1" />
      <Cloud x={50} y={70} />
      <Cloud x={250} y={50} />
    </>
  );
}

const Cloud = ({ x, y }: { x: number; y: number }) => (
  <path d={`M${x - 30} ${y + 14}a14 14 0 0 1 8-26 20 20 0 0 1 38-2 14 14 0 0 1 14 28z`} fill="#fff" />
);

const Rainbow = () => (
  <g fill="none" strokeWidth="14">
    <path d="M-10 330a160 160 0 0 1 320 0" stroke="#f9a8c4" />
    <path d="M4 330a146 146 0 0 1 292 0" stroke="#ffe08a" />
    <path d="M18 330a132 132 0 0 1 264 0" stroke="#bfe8c9" />
    <path d="M32 330a118 118 0 0 1 236 0" stroke="#b9dcff" />
  </g>
);

/**
 * 필터 옷. viewBox 300×400 에서 얼굴이 (150,190), 반지름 70 쯤에 온다고 보고 그린다.
 * 사진 필터와 완성 그림이 같은 옷을 쓴다.
 */
export function Costume({ role }: { role: string }) {
  const body = (fill: string) => <path d="M20 400c6-70 50-104 130-104s124 34 130 104z" fill={fill} />;
  switch (role) {
    case "captain":
      return (
        <>
          {body("#1b2a52")}
          <path d="M118 298l32 52 32-52z" fill="#fff" />
          <path d="M144 312h12l6 44-12 14-12-14z" fill="#c23b32" />
          <path d="M44 352l64-22M48 368l60-20M256 352l-64-22M252 368l-60-20" stroke="#d9a441" strokeWidth="8" strokeLinecap="round" />
          <path d="M70 120q80-100 160 0z" fill="#1b2a52" />
          <rect x="66" y="112" width="168" height="16" rx="4" fill="#d9a441" />
          <path d="M72 128q78 22 156 0l-8 12q-70 18-140 0z" fill="#111827" />
          <circle cx="150" cy="86" r="14" fill="#d9a441" />
          <circle cx="150" cy="86" r="6" fill="#1b2a52" />
        </>
      );
    case "crew":
      return (
        <>
          {body("#1b2a52")}
          <path d="M112 300l38 44 38-44z" fill="#fff" />
          <path d="M120 312l30 22 30-22-12 26-18-6-18 6z" fill="#c23b32" />
          <path d="M150 334l-16 34 16-8 16 8z" fill="#d9a441" />
          <path d="M84 342l40-10M216 342l-40-10" stroke="#d9a441" strokeWidth="5" strokeLinecap="round" />
          <g transform="rotate(-12 150 100)">
            <rect x="104" y="84" width="92" height="40" rx="10" fill="#1b2a52" />
            <rect x="104" y="112" width="92" height="10" fill="#d9a441" />
            <path d="M136 98h28M140 92l10 6 10-6" stroke="#d9a441" strokeWidth="4" fill="none" strokeLinecap="round" />
          </g>
        </>
      );
    case "explorer":
      return (
        <>
          {body("#c9a66b")}
          <path d="M86 310c-8 40-4 70 0 90H26c4-50 24-78 60-90zM214 310c8 40 4 70 0 90h60c-4-50-24-78-60-90z" fill="#5f7d3f" />
          <path d="M118 300l32 36 32-36" fill="none" stroke="#8a3a2c" strokeWidth="10" strokeLinejoin="round" />
          <circle cx="236" cy="360" r="14" fill="#fbf3e4" stroke="#8a3a2c" strokeWidth="4" />
          <path d={COMPASS} fill="#8a3a2c" transform="translate(236 360) scale(.18) translate(-50 -50)" />
          <ellipse cx="150" cy="126" rx="112" ry="22" fill="#c9a66b" />
          <path d="M90 124q4-62 60-62t60 62z" fill="#d6b67a" />
          <rect x="90" y="108" width="120" height="14" fill="#7a5a32" />
        </>
      );
    case "friend":
      return (
        <>
          {body("#ff9fbd")}
          <path d={STAR} fill="#ffd84d" stroke="#2d2f4a" strokeWidth="5" strokeLinejoin="round" transform="translate(150 60) scale(.5) translate(-50 -50)" />
          <path d={STAR} fill="#ffd84d" stroke="#2d2f4a" strokeWidth="6" strokeLinejoin="round" transform="translate(40 120) scale(.3) translate(-50 -50)" />
          <g transform="translate(190 228) scale(.7)">
            <MonggeShape wink />
          </g>
        </>
      );
    default:
      return null;
  }
}

/** 사진 필터 가장자리 장식. 얼굴을 가리지 않게 위쪽 귀퉁이에만 둔다. */
export function FilterDeco({ role }: { role: string }) {
  if (role === "friend")
    return (
      <g fill="none" strokeWidth="9" opacity=".85">
        <path d="M-6 110a96 96 0 0 1 96-96" stroke="#f9a8c4" />
        <path d="M-6 100a86 86 0 0 1 86-86" stroke="#ffe08a" />
        <path d="M-6 90a76 76 0 0 1 76-76" stroke="#bfe8c9" />
        <path d="M-6 80a66 66 0 0 1 66-66" stroke="#b9dcff" />
      </g>
    );
  if (role === "explorer") return <circle cx="262" cy="40" r="22" fill="#f4d466" opacity=".9" />;
  return (
    <>
      <Cloud x={46} y={40} />
      <Cloud x={262} y={30} />
    </>
  );
}
