import Image from "next/image";

/**
 * 공항 안내 캐릭터 나랑이(키오스크·안내로봇의 얼굴). 예전에는 흰 로봇 그림(SVG)이었는데 2026-11 나랑이로 바꿨다.
 * 잘 때(sleep)는 잠든 그림, 깨어 있을 때(awake·happy)는 정면 그림. 그림일 뿐이므로 화면 읽기 프로그램에는 감춘다.
 */
export function Robot({ mood, size = 220 }: { mood: "sleep" | "awake" | "happy"; size?: number }) {
  return (
    <Image
      className={`robot robot-${mood}`}
      src={mood === "sleep" ? "/images/haneuli/narangi-sleep.webp" : "/images/haneuli/narangi.webp"}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}
