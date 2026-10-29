// 스탬프북 그림. 문장·도장·장식은 손으로 그린 SVG 다.
// 「하늘이」는 팀이 디자인한 인천공항 마스코트 시안 그림(public/stamp/haneul.webp)을 그대로 쓰고,
// 기장·승무원·탐험가 필터 옷은 팀이 준 옷 사진(public/stamp/costume-*.webp, 배경·얼굴 자리를 투명하게 다듬은 것)을 쓴다.
// 하늘이 친구 필터는 옷을 입히지 않고, 시안의 여러 방향 하늘이(public/stamp/haneul-*.webp)가 사진 곳곳에 함께 선다.
import Image from "next/image";
import type { ThemeId } from "@/lib/stamp-book";

const PLANE = "M50 18c3 0 5 3 5 7v17l24 14v7l-24-7v14l7 6v6l-12-4-12 4v-6l7-6V56l-24 7v-7l24-14V25c0-4 2-7 5-7z";
const STAR = "M50 8l11 27 29 2-22 19 7 28-25-15-25 15 7-28-22-19 29-2z";
const COMPASS = "M50 6l9 35 35 9-35 9-9 35-9-35-35-9 35-9z";

const DEEP = "var(--color-blue)";
const YELLOW = "var(--color-accent)";
const SKY = "var(--color-art-sky)";

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

/** 인증 사진(600×800) 위에 옷 사진을 그릴 자리: 옷 좌표를 scale 배 해 (x, y) 에 놓는다. faceW 는 사진에서 얼굴 자리 폭. */
export function costumeLayout(p: (typeof COSTUME_PHOTO)[string]) {
  const scale = 600 / COSTUME_SIZE.w;
  return { scale, x: SLOT.x - p.midX * scale, y: SLOT.y - (p.chin - p.holeW * EYE_FROM_CHIN) * scale, faceW: p.holeW * scale };
}

/**
 * 하늘이 친구 필터: 인증 사진(600×800) 곳곳에 함께 서는 하늘이들. 가운데(얼굴 자리)는 비우고,
 * 아래 양옆 하늘이는 가운데를 바라보고, 위 하늘이는 귀퉁이에서 인사한다. 아래 글자 띠(56px)에는 걸치지 않는다.
 * rotate 는 도(°), 그림 가운데를 축으로 돌린다.
 */
export const FRIENDS = [
  { src: "/stamp/haneul-right.webp", x: -18, y: 458, w: 230, h: 286, rotate: 4 },
  { src: "/stamp/haneul-left.webp", x: 383, y: 444, w: 235, h: 300, rotate: -4 },
  { src: HANEUL_SRC, x: 412, y: 30, w: 170, h: 170, rotate: 10 },
];

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

/**
 * 사진을 찍기 전 완성 화면에 보여 줄 그림. 인증 사진과 같은 배치다.
 * 옷 필터는 옷만(얼굴 자리는 비움), 하늘이 친구 필터는 가운데를 비우고 둘레의 하늘이들만.
 */
export function Portrait({ role }: { role: string }) {
  const photo = COSTUME_PHOTO[role];
  const l = photo && costumeLayout(photo);
  return (
    <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" className="sb-art" aria-hidden="true">
      <Backdrop role={role} />
      {l ? (
        <g transform={`scale(.5) translate(${l.x} ${l.y}) scale(${l.scale})`}>
          <image href={photo.src} width={COSTUME_SIZE.w} height={COSTUME_SIZE.h} />
        </g>
      ) : (
        <g transform="scale(.5)">
          {FRIENDS.map((f) => (
            <image
              key={f.src}
              href={f.src}
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              transform={`rotate(${f.rotate} ${f.x + f.w / 2} ${f.y + f.h / 2})`}
            />
          ))}
        </g>
      )}
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

/** 사진 필터 가장자리 장식. 얼굴을 가리지 않게 위쪽 귀퉁이에만 둔다. viewBox 0 0 300 400. */
export function FilterDeco({ role }: { role: string }) {
  if (role === "friend")
    return (
      <>
        <Cloud x={46} y={40} />
        <path d={STAR} fill={YELLOW} stroke={DEEP} strokeWidth="6" strokeLinejoin="round" transform="translate(104 78) scale(.26) translate(-50 -50)" />
        <path d={STAR} fill={YELLOW} stroke={DEEP} strokeWidth="7" strokeLinejoin="round" transform="translate(136 44) scale(.16) translate(-50 -50)" />
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
