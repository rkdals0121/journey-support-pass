// 스탬프북 그림. 문장·도장·장식은 손으로 그린 SVG 다.
// 「하늘이」는 팀이 디자인한 인천공항 마스코트 시안 그림(public/stamp/haneul.webp)을 그대로 쓰고,
// 기장·승무원·탐험가 필터 옷은 팀이 준 옷 사진(public/stamp/costume-*.webp, 배경·얼굴 자리를 투명하게 다듬은 것)을 쓴다.
import Image from "next/image";
import type { ThemeId } from "@/lib/stamp-book";

const PLANE = "M50 18c3 0 5 3 5 7v17l24 14v7l-24-7v14l7 6v6l-12-4-12 4v-6l7-6V56l-24 7v-7l24-14V25c0-4 2-7 5-7z";
const STAR = "M50 8l11 27 29 2-22 19 7 28-25-15-25 15 7-28-22-19 29-2z";
const COMPASS = "M50 6l9 35 35 9-35 9-9 35-9-35-35-9 35-9z";

const DEEP = "var(--color-blue)";
const YELLOW = "var(--color-accent)";
const SKY = "var(--color-art-sky)";
// 하늘이 시안 색: 파란 후드, 보라빛 띠, 청록 스카프·헤드폰 불빛
const HOOD = "#4a72c6";
const BAND = "#a9b3e9";
const TEAL = "#3cc4d6";

export const HANEUL_SRC = "/stamp/haneul.webp";

/**
 * 옷 사진(512×1024, 팀 시안 한 장에 나란히 있던 세 벌을 나눠 체크무늬 배경과 얼굴 자리만 투명하게 한 것)과
 * 그 안의 얼굴 자리: 가운데 x(midX), 턱(chin), 가장 넓은 폭(holeW).
 */
export const COSTUME_PHOTO: Record<string, { src: string; midX: number; chin: number; holeW: number }> = {
  captain: { src: "/stamp/costume-captain.webp", midX: 254, chin: 501, holeW: 258 },
  crew: { src: "/stamp/costume-crew.webp", midX: 256, chin: 503, holeW: 240 },
  explorer: { src: "/stamp/costume-explorer.webp", midX: 254, chin: 510, holeW: 232 },
};
export const COSTUME_SIZE = { w: 512, h: 1024 };

/** 인증 사진(600×800)에서 두 눈 사이 가운데가 놓이는 자리. 옷은 늘 여기에 맞춰 가운데 그리고, 사진 속 얼굴을 이 자리로 옮긴다. */
export const SLOT = { x: 300, y: 360 };
/** 눈은 턱에서 얼굴 자리 폭의 이만큼 위에 있다고 본다(사람 얼굴 비율). */
const EYE_FROM_CHIN = 0.75;

/** 인증 사진(600×800) 위에 옷을 그릴 자리: 옷 좌표를 scale 배 해 (x, y) 에 놓는다. faceW 는 사진에서 얼굴 자리 폭. */
export function costumeLayout(role: string) {
  const p = COSTUME_PHOTO[role];
  if (p) {
    const scale = 600 / COSTUME_SIZE.w;
    return { scale, x: SLOT.x - p.midX * scale, y: SLOT.y - (p.chin - p.holeW * EYE_FROM_CHIN) * scale, faceW: p.holeW * scale };
  }
  // 하늘이 친구 옷 SVG 는 두 눈 사이 가운데 (150,190), 얼굴 폭 150 으로 그렸다.
  const scale = 1.9;
  return { scale, x: SLOT.x - 150 * scale, y: SLOT.y - 190 * scale, faceW: 150 * scale };
}

/** 하늘이 친구 필터에서 어깨 위에 앉는 하늘이 자리(Costume 좌표). */
export const BUDDY = { x: 190, y: 262, size: 112 };

export function Haneul({ size = 120 }: { size?: number }) {
  return <Image src={HANEUL_SRC} alt="" width={size} height={size} className="sb-haneul" aria-hidden="true" />;
}

/** 표지와 인증 카드의 둥근 문장 */
export function Emblem({ theme, size = 112 }: { theme: ThemeId; size?: number }) {
  if (theme === "friend") return <Haneul size={size * 1.15} />;
  const line = theme === "flight" ? "var(--color-accent)" : "var(--color-accent)";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke={line} strokeWidth="3" />
      <circle cx="50" cy="50" r="39" fill="none" stroke={line} strokeWidth="1" strokeDasharray="2 3" />
      {theme === "flight" ? (
        <path d={PLANE} fill={line} transform="translate(50 50) rotate(45) scale(.62) translate(-50 -50)" />
      ) : (
        <>
          <path d={COMPASS} fill={line} transform="translate(50 50) scale(.78) translate(-50 -50)" />
          <circle cx="50" cy="50" r="5" fill="var(--color-art-leaf)" />
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
  const ink = theme === "flight" ? "var(--color-rose)" : "var(--color-rose)";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="var(--color-accent-soft)" />
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

/** 사진을 찍기 전 완성 화면에 보여 줄 그림: 고른 필터의 옷만, 얼굴 자리는 비워 둔다. 인증 사진과 같은 배치다. */
export function Portrait({ role }: { role: string }) {
  const photo = COSTUME_PHOTO[role];
  const l = costumeLayout(role);
  return (
    <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" className="sb-art" aria-hidden="true">
      <Backdrop role={role} />
      <g transform={`scale(.5) translate(${l.x} ${l.y}) scale(${l.scale})`}>
        {photo ? (
          <image href={photo.src} width={COSTUME_SIZE.w} height={COSTUME_SIZE.h} />
        ) : (
          <>
            <Costume role={role} />
            <image href={HANEUL_SRC} x={BUDDY.x} y={BUDDY.y} width={BUDDY.size} height={BUDDY.size} />
          </>
        )}
      </g>
    </svg>
  );
}

function Backdrop({ role }: { role: string }) {
  if (role === "explorer")
    return (
      <>
        <rect width="300" height="400" fill="var(--color-primary-soft)" />
        <circle cx="240" cy="70" r="30" fill="var(--color-accent)" />
        <path d="M-20 300l90-150 90 150zM130 300l90-140 100 140z" fill="var(--color-art-leaf)" />
      </>
    );
  return (
    <>
      <rect width="300" height="400" fill={role === "friend" ? "var(--color-blue-soft)" : "var(--color-art-sky)"} />
      <Cloud x={50} y={70} />
      <Cloud x={250} y={50} />
    </>
  );
}

const Cloud = ({ x, y }: { x: number; y: number }) => (
  <path d={`M${x - 30} ${y + 14}a14 14 0 0 1 8-26 20 20 0 0 1 38-2 14 14 0 0 1 14 28z`} fill="var(--color-surface)" />
);

/**
 * 하늘이 친구 필터 옷(SVG). 얼굴 가운데가 (150,190), 얼굴 폭이 150 쯤이라고 보고 그린다.
 * 사진 필터는 이 좌표계를 찾은 얼굴 위치·크기·기울기에 맞춰 옮겨 그린다. 어깨 위 하늘이(BUDDY)는 그림 파일이라 따로 얹는다.
 * 몸통은 아래로 길게(y 1050 까지) 내려 그려 얼굴이 작게 잡혀도 화면 아래가 비지 않는다.
 * 기장·승무원·탐험가는 옷 사진(COSTUME_PHOTO)을 쓰므로 여기서 그리지 않는다.
 */
export function Costume({ role }: { role: string }) {
  if (role !== "friend") return null;
  // 하늘이 후드를 쓴 모습: 보라빛 띠를 두른 파란 후드, 꼬리 날개, 귀 옆 헤드폰, 청록 스카프.
  return (
    <>
      <path d="M-40 1050V420c10-80 70-124 190-124s180 44 190 124v630z" fill={HOOD} />
      <path d="M104 300q46 40 92 0l10 22q-56 44-112 0z" fill={TEAL} />
      <path d="M196 70c8-30 30-46 54-52 6 26-2 52-20 70z" fill={HOOD} />
      <path d={PLANE} fill="var(--color-surface)" transform="translate(228 42) rotate(40) scale(.28) translate(-50 -50)" />
      <path d="M66 140c14-58 50-84 84-84s70 26 84 84c-24-28-52-40-84-40s-60 12-84 40z" fill={HOOD} />
      <path d="M80 112c16-30 42-44 70-44s54 14 70 44c-22-14-44-20-70-20s-48 6-70 20z" fill={BAND} />
      <circle cx="66" cy="196" r="22" fill="var(--color-surface)" stroke="#c8ccd4" strokeWidth="3" />
      <circle cx="66" cy="196" r="13" fill="#8fa3b5" stroke={TEAL} strokeWidth="4" />
      <circle cx="234" cy="196" r="22" fill="var(--color-surface)" stroke="#c8ccd4" strokeWidth="3" />
      <circle cx="234" cy="196" r="13" fill="#8fa3b5" stroke={TEAL} strokeWidth="4" />
    </>
  );
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
  if (role === "explorer") return <circle cx="262" cy="40" r="22" fill="var(--color-accent)" opacity=".9" />;
  return (
    <>
      <Cloud x={46} y={40} />
      <Cloud x={262} y={30} />
    </>
  );
}
