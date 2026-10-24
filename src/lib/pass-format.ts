// 패스의 QR 값과 번호의 모양. 서버와 브라우저가 함께 쓴다. 서버 전용 코드를 가져오지 말 것.

// QR 에 들어가는 값. 대문자와 숫자 16자(80비트)다.
// 헷갈리는 글자(I, L, O, U)는 쓰지 않는다. 소문자를 쓰지 않는 까닭은 QR 크기 때문이다.
// 대문자·숫자만 있으면 QR 이 한 글자를 5.5비트로 담아(영숫자 방식) 칸 수가 줄고, 같은 크기로 찍어도 한 칸이 커져 잘 읽힌다.
export const TOKEN_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const TOKEN_LENGTH = 16;
export const TOKEN_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/;
export const PASS_NO_LENGTH = 6;
export const PASS_NO_RE = /^\d{6}$/;

/** QR 에 넣는 주소. 전부 대문자로 만든다(위 설명). 주소의 /P/ 는 next.config 가 /p/ 로 받아 준다. */
export function passUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/p/${token}`.toUpperCase();
}

/** 여섯 자리 번호를 화면에 보여주는 모양. "123 456" */
export function formatPassNo(passNo: string): string {
  return passNo.length === PASS_NO_LENGTH ? `${passNo.slice(0, 3)} ${passNo.slice(3)}` : passNo;
}

/** 스캔한 글자에서 패스 값을 꺼낸다. "HTTPS://HOST/P/XXXX", "https://host/p/xxxx", "XXXX" 를 모두 받는다. */
export function extractToken(scanned: string): string | null {
  const s = (scanned ?? "").trim().toUpperCase();
  if (TOKEN_RE.test(s)) return s;
  const m = /\/P\/([0-9A-Z]{16})\/?(?:[?#].*)?$/.exec(s);
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}

// 시연용 모의 탑승권의 QR. 실제 탑승권 바코드(IATA BCBP)는 항공사가 만들고 공항이 읽는 방식은 확인하지 못했다(제안서 리스크).
// 시제품은 편과 탑승권 번호만 담는다: "BP1:20261024:KE123:0123456789". 이름은 없다.
export const BOARDING_REF_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const BOARDING_RE = /^BP1:(\d{4})(\d{2})(\d{2}):([A-Z0-9]{3,8}):([0-9A-HJKMNP-TV-Z]{10})$/;

export interface BoardingPass {
  flightDate: string; // 2026-10-24
  flightNo: string;
  ref: string;
}

export function boardingPassText(b: BoardingPass): string {
  return `BP1:${b.flightDate.replace(/-/g, "")}:${b.flightNo}:${b.ref}`;
}

/** 찍은 글자가 모의 탑승권이면 편과 번호를 꺼낸다. */
export function parseBoardingPass(scanned: string): BoardingPass | null {
  const m = BOARDING_RE.exec((scanned ?? "").trim().toUpperCase());
  return m ? { flightDate: `${m[1]}-${m[2]}-${m[3]}`, flightNo: m[4], ref: m[5] } : null;
}

/** 손으로 넣은 번호에서 숫자만 남긴다. 여섯 자리가 아니면 null. */
export function cleanPassNo(input: unknown): string | null {
  const s = typeof input === "string" ? input.replace(/\D/g, "") : "";
  return PASS_NO_RE.test(s) ? s : null;
}
