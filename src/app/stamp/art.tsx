// 스탬프북 그림. 모두 손으로 그린 SVG 라 따로 받아 올 파일이 없다.
// 「하늘이」는 팀이 디자인한 인천공항 교통약자 지원 마스코트 시안을 옮겨 그린 것이다.
import type { ThemeId } from "@/lib/stamp-book";

const PLANE = "M50 18c3 0 5 3 5 7v17l24 14v7l-24-7v14l7 6v6l-12-4-12 4v-6l7-6V56l-24 7v-7l24-14V25c0-4 2-7 5-7z";
const STAR = "M50 8l11 27 29 2-22 19 7 28-25-15-25 15 7-28-22-19 29-2z";
const COMPASS = "M50 6l9 35 35 9-35 9-9 35-9-35-35-9 35-9z";

// 하늘이 색 (시안의 Color Palette)
const DEEP = "#36588f";
const YELLOW = "#f5cf3c";
const SKY = "#4cc3e8";

export type Mood = "smile" | "wink" | "joy" | "wow";

/** 하늘이: 꼬리 날개 달린 파란 후드, 노란 띠, 헤드폰. viewBox 0 0 160 160 안의 g 모양(사진 필터 svg 안에도 그대로 넣는다). */
function HaneulShape({ mood, hands }: { mood: Mood; hands: boolean }) {
  return (
    <>
      {/* 꼬리 날개 */}
      <path d="M108 44c6-22 22-34 40-38 4 18-2 38-14 52z" fill={DEEP} />
      <path d={PLANE} fill="#fff" transform="translate(132 26) rotate(40) scale(.2) translate(-50 -50)" />
      {/* 왼쪽 헤드폰(뒤) */}
      <circle cx="20" cy="96" r="15" fill="#e9f1f8" stroke={SKY} strokeWidth="3" />
      {/* 후드 */}
      <path d="M80 30c38 0 64 26 64 62 0 34-28 56-64 56s-64-22-64-56c0-36 26-62 64-62z" fill={DEEP} />
      <path d="M30 60c14-22 34-31 52-31 22 0 42 10 54 28-20-8-38-11-54-11-20 0-36 5-52 14z" fill={YELLOW} />
      {/* 얼굴 */}
      <path d="M80 62c30 0 48 16 48 40 0 22-20 36-48 36s-48-14-48-36c0-24 18-40 48-40z" fill="#fff" />
      <circle cx="54" cy="112" r="7" fill="#f7b4c2" />
      <circle cx="106" cy="112" r="7" fill="#f7b4c2" />
      {mood === "joy" ? (
        <path d="M54 100q8-9 16 0M90 100q8-9 16 0" fill="none" stroke="#1d3157" strokeWidth="4" strokeLinecap="round" />
      ) : (
        <>
          <ellipse cx="62" cy="100" rx="7" ry="9" fill="#1d3157" />
          <circle cx="64" cy="96" r="2.6" fill="#fff" />
          {mood === "wink" ? (
            <path d="M90 101q8-8 16 0" fill="none" stroke="#1d3157" strokeWidth="4" strokeLinecap="round" />
          ) : (
            <>
              <ellipse cx="98" cy="100" rx="7" ry="9" fill="#1d3157" />
              <circle cx="100" cy="96" r="2.6" fill="#fff" />
            </>
          )}
        </>
      )}
      <path d="M55 84q6-4 12-2M93 82q6-2 12 2" fill="none" stroke={DEEP} strokeWidth="2.5" strokeLinecap="round" />
      {mood === "wow" ? (
        <ellipse cx="80" cy="120" rx="4" ry="5" fill="#d8455d" />
      ) : (
        <path d="M70 114q10 12 20 0z" fill="#d8455d" stroke="#1d3157" strokeWidth="2" strokeLinejoin="round" />
      )}
      {/* 오른쪽 헤드폰(앞) */}
      <circle cx="141" cy="96" r="16" fill="#f4f8fc" stroke="#c9d6e3" strokeWidth="2" />
      <circle cx="141" cy="96" r="10" fill={DEEP} stroke={SKY} strokeWidth="3" />
      {hands && (
        <>
          <circle cx="50" cy="146" r="12" fill="#fff" />
          <circle cx="110" cy="146" r="12" fill="#fff" />
          <path d="M36 140q4-8 12-10M124 140q-4-8-12-10" fill="none" stroke={YELLOW} strokeWidth="6" strokeLinecap="round" />
        </>
      )}
    </>
  );
}

export function Haneul({ size = 120, mood = "smile", hands = false }: { size?: number; mood?: Mood; hands?: boolean }) {
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden="true">
      <HaneulShape mood={mood} hands={hands} />
    </svg>
  );
}

/** 표지와 인증 카드의 둥근 문장 */
export function Emblem({ theme, size = 112 }: { theme: ThemeId; size?: number }) {
  if (theme === "friend") return <Haneul size={size * 1.15} hands />;
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
        <circle cx="50" cy="50" r="46" fill={SKY} stroke={DEEP} strokeWidth="5" />
        <path d={STAR} fill={YELLOW} stroke={DEEP} strokeWidth="5" strokeLinejoin="round" transform="translate(50 52) scale(.62) translate(-50 -50)" />
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
  return (
    <>
      <rect width="300" height="400" fill={role === "friend" ? "#cfeefb" : "#bcd7f1"} />
      <Cloud x={50} y={70} />
      <Cloud x={250} y={50} />
    </>
  );
}

const Cloud = ({ x, y }: { x: number; y: number }) => (
  <path d={`M${x - 30} ${y + 14}a14 14 0 0 1 8-26 20 20 0 0 1 38-2 14 14 0 0 1 14 28z`} fill="#fff" />
);

/**
 * 필터 옷. 얼굴 가운데가 (150,190), 얼굴 폭이 150 쯤이라고 보고 그린다.
 * 사진 필터는 이 좌표계를 찾은 얼굴 위치·크기·기울기에 맞춰 옮겨 그린다.
 * 몸통은 아래로 길게(y 1050 까지) 내려 그려 얼굴이 작게 잡혀도 화면 아래가 비지 않는다. 완성 그림은 400 에서 잘린다.
 */
export function Costume({ role }: { role: string }) {
  const body = (fill: string) => <path d="M-40 1050V420c10-80 70-124 190-124s180 44 190 124v630z" fill={fill} />;
  switch (role) {
    case "captain":
      return (
        <>
          {body("#1b2a52")}
          <path d="M118 298l32 52 32-52z" fill="#fff" />
          <path d="M144 312h12l6 44-12 14-12-14z" fill="#c23b32" />
          <path d="M4 348l70-24M8 366l66-22M296 348l-70-24M292 366l-66-22" stroke="#d9a441" strokeWidth="9" strokeLinecap="round" />
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
          <path d="M40 340l50-12M260 340l-50-12" stroke="#d9a441" strokeWidth="6" strokeLinecap="round" />
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
          <path d="M86 306c-8 40-4 74 0 94v650H-30V420c8-60 48-100 116-114zM214 306c8 40 4 74 0 94v650h116V420c-8-60-48-100-116-114z" fill="#5f7d3f" />
          <path d="M118 300l32 36 32-36" fill="none" stroke="#8a3a2c" strokeWidth="10" strokeLinejoin="round" />
          <circle cx="236" cy="360" r="14" fill="#fbf3e4" stroke="#8a3a2c" strokeWidth="4" />
          <path d={COMPASS} fill="#8a3a2c" transform="translate(236 360) scale(.18) translate(-50 -50)" />
          <ellipse cx="150" cy="126" rx="112" ry="22" fill="#c9a66b" />
          <path d="M90 124q4-62 60-62t60 62z" fill="#d6b67a" />
          <rect x="90" y="108" width="120" height="14" fill="#7a5a32" />
        </>
      );
    case "friend":
      // 하늘이 후드를 쓴 모습: 머리 위 노란 띠와 꼬리 날개, 귀 옆 헤드폰, 어깨 위 하늘이.
      return (
        <>
          {body(DEEP)}
          <path d="M112 300l38 40 38-40" fill="none" stroke="#fff" strokeWidth="12" strokeLinejoin="round" />
          <path d="M150 340v80" stroke={YELLOW} strokeWidth="8" strokeLinecap="round" />
          <path d="M196 70c8-30 30-46 54-52 6 26-2 52-20 70z" fill={DEEP} />
          <path d={PLANE} fill="#fff" transform="translate(228 42) rotate(40) scale(.28) translate(-50 -50)" />
          <path d="M66 140c14-58 50-84 84-84s70 26 84 84c-24-28-52-40-84-40s-60 12-84 40z" fill={DEEP} />
          <path d="M80 112c16-30 42-44 70-44s54 14 70 44c-22-14-44-20-70-20s-48 6-70 20z" fill={YELLOW} />
          <circle cx="66" cy="196" r="22" fill="#f4f8fc" stroke="#c9d6e3" strokeWidth="3" />
          <circle cx="66" cy="196" r="13" fill={DEEP} stroke={SKY} strokeWidth="4" />
          <circle cx="234" cy="196" r="22" fill="#f4f8fc" stroke="#c9d6e3" strokeWidth="3" />
          <circle cx="234" cy="196" r="13" fill={DEEP} stroke={SKY} strokeWidth="4" />
          <g transform="translate(196 270) scale(.62)">
            <HaneulShape mood="wink" hands />
          </g>
        </>
      );
    default:
      return null;
  }
}

/** 사진 필터 가장자리 장식. 얼굴을 가리지 않게 위쪽 귀퉁이에만 둔다. viewBox 0 0 300 400. */
export function FilterDeco({ role }: { role: string }) {
  if (role === "friend")
    return (
      <>
        <Cloud x={46} y={40} />
        <path d={STAR} fill={YELLOW} stroke={DEEP} strokeWidth="6" strokeLinejoin="round" transform="translate(262 40) scale(.28) translate(-50 -50)" />
        <path d={STAR} fill={YELLOW} stroke={DEEP} strokeWidth="7" strokeLinejoin="round" transform="translate(230 74) scale(.18) translate(-50 -50)" />
      </>
    );
  if (role === "explorer") return <circle cx="262" cy="40" r="22" fill="#f4d466" opacity=".9" />;
  return (
    <>
      <Cloud x={46} y={40} />
      <Cloud x={262} y={30} />
    </>
  );
}
