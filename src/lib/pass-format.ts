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

/** 손으로 넣은 번호에서 숫자만 남긴다. 여섯 자리가 아니면 null. */
export function cleanPassNo(input: unknown): string | null {
  const s = typeof input === "string" ? input.replace(/\D/g, "") : "";
  return PASS_NO_RE.test(s) ? s : null;
}
