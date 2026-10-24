// 증빙서류 인식. 기기(휴대전화, 키오스크) 안에서 읽은 글자를 보고 서류 종류와 나이를 판정한다.
// 서류 사진과 읽은 글자는 기기 밖으로 보내지 않는다. 서버에는 "확인됨"만 간다(제안서: 공항은 증빙을 보관하지 않는다).
// 할 수 있는 것: 여권 아래쪽 기계판독줄(MRZ)을 읽고 검증숫자로 맞는지 보고, 생년월일로 나이를 잰다.
//   복지카드·산모수첩·가족관계증명서는 서류에 찍힌 글자로 종류를 알아본다. 가족관계증명서는 적힌 생년월일로 나이를 잰다.
// 할 수 없는 것: 위조 여부, 서류의 주인이 등록하는 사람인지. 시연에서 "서류 종류와 나이 확인까지"라고 밝힌다.
// 이 파일은 브라우저에서도 읽는다. 서버 전용 코드를 가져오지 말 것.

/** 증빙서류를 고르는 데 쓰는 대상. */
export type Target = "elderly" | "infant" | "disabled" | "pregnant";

// 인천공항 교통약자 우대출구의 나이 기준으로 알려진 값. 기업탐방에서 확인해 바꾼다.
export const ELDERLY_AGE = 70; // 이 나이 이상이면 고령자
export const INFANT_AGE = 7; // 이 나이 미만이면 영유아

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

export type ScanKind = "passport" | "welfare" | "maternity" | "family";

export interface Scan {
  kind: ScanKind;
  /** 여권: 주인의 생년월일. 가족관계증명서: 적힌 사람들의 생년월일. 그 밖은 빈 목록. */
  births: Ymd[];
}

/** ICAO 9303 검증숫자. 숫자는 그대로, A~Z 는 10~35, < 는 0. 가중치 7, 3, 1 을 되풀이한다. */
export function checkDigit(s: string): number {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const v = c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55;
    sum += v * w[i % 3];
  }
  return sum % 10;
}

// 숫자 자리에 잘못 읽히기 쉬운 글자를 숫자로 바꾼다(O→0, I→1 등). 날짜와 검증숫자 자리에만 쓴다.
const DIGIT_FIX: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6" };
const digits = (s: string) => s.replace(/[OQDILZSBG]/g, (c) => DIGIT_FIX[c]);

function yymmdd(s: string, pivotYear: number): Ymd | null {
  if (!/^\d{6}$/.test(s)) return null;
  const yy = Number(s.slice(0, 2));
  const m = Number(s.slice(2, 4));
  const d = Number(s.slice(4, 6));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // 두 자리 해를 네 자리로. 생년월일은 올해보다 뒤일 수 없으므로 넘으면 1900년대다.
  const y = 2000 + yy > pivotYear ? 1900 + yy : 2000 + yy;
  return { y, m, d };
}

/**
 * 여권의 기계판독줄(TD3: 44자 두 줄)을 찾아 생년월일을 읽는다. 검증숫자가 맞지 않으면 null.
 * 이름과 여권번호는 돌려주지 않는다(쓸 데가 없다).
 */
export function parseMrz(text: string, today: Date): Ymd | null {
  const lines = text
    .toUpperCase()
    .replace(/[«‹]/g, "<")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, "").replace(/[^A-Z0-9<]/g, ""))
    .filter((l) => l.length >= 40);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // 두 번째 줄: 여권번호 9 + 검증 1 + 국적 3 + 생년월일 6 + 검증 1 + 성별 1 + 만료일 6 + 검증 1 + ...
    // 첫 줄이 P 로 시작하는지는 보지 않는다. 사진에서 첫 줄이 잘려도 두 번째 줄만으로 판정한다.
    const line = l.slice(0, 44);
    if (line.length < 28) continue;
    const numCheck = digits(line[9]);
    const birth = digits(line.slice(13, 19));
    const birthCheck = digits(line[19]);
    const expiry = digits(line.slice(21, 27));
    const expiryCheck = digits(line[27]);
    if (!/^\d$/.test(birthCheck) || !/^\d$/.test(expiryCheck) || !/^[\d<]$/.test(numCheck)) continue;
    if (checkDigit(birth) !== Number(birthCheck) || checkDigit(expiry) !== Number(expiryCheck)) continue;
    // 여권번호의 검증숫자도 맞아야 한다. 날짜 두 개가 우연히 맞는 일을 줄인다.
    if (numCheck !== "<" && checkDigit(line.slice(0, 9)) !== Number(numCheck)) continue;
    const b = yymmdd(birth, today.getFullYear());
    if (b) return b;
  }
  return null;
}

/** 오늘 기준 만 나이. */
export function ageOn(b: Ymd, today: Date): number {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  return y - b.y - (m < b.m || (m === b.m && d < b.d) ? 1 : 0);
}

const squash = (s: string) => s.replace(/\s+/g, "");

/** 가족관계증명서 등에 적힌 "1950년 03월 02일" 꼴의 날짜. */
function koreanDates(text: string): Ymd[] {
  const out: Ymd[] = [];
  for (const m of squash(text).matchAll(/(19\d{2}|20\d{2})년(\d{1,2})월(\d{1,2})일/g)) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push({ y, m: mo, d });
  }
  return out;
}

/** 읽은 글자로 서류 종류를 알아본다. 모르는 서류면 null. */
export function classify(text: string, today: Date): Scan | null {
  const birth = parseMrz(text, today);
  if (birth) return { kind: "passport", births: [birth] };
  const s = squash(text);
  if (/가족관계증명서/.test(s)) return { kind: "family", births: koreanDates(text) };
  if (/(산모수첩|모자보건수첩|임산부|임신확인)/.test(s)) return { kind: "maternity", births: [] };
  if (/장애인/.test(s) && /(복지카드|등록증|복지)/.test(s)) return { kind: "welfare", births: [] };
  return null;
}

export type Verdict = { ok: true } | { ok: false; reason: "unknown" | "wrong_doc" | "age" };

/** 고른 대상에 맞는 서류이고 나이 기준을 채우는가. */
export function judge(target: Target, scan: Scan | null, today: Date): Verdict {
  if (!scan) return { ok: false, reason: "unknown" };
  const ages = scan.births.map((b) => ageOn(b, today));
  switch (target) {
    case "disabled":
      return scan.kind === "welfare" ? { ok: true } : { ok: false, reason: "wrong_doc" };
    case "pregnant":
      return scan.kind === "maternity" ? { ok: true } : { ok: false, reason: "wrong_doc" };
    case "elderly":
      if (scan.kind !== "passport" && scan.kind !== "family") return { ok: false, reason: "wrong_doc" };
      return ages.some((a) => a >= ELDERLY_AGE) ? { ok: true } : { ok: false, reason: "age" };
    case "infant":
      if (scan.kind !== "passport" && scan.kind !== "family") return { ok: false, reason: "wrong_doc" };
      return ages.some((a) => a >= 0 && a < INFANT_AGE) ? { ok: true } : { ok: false, reason: "age" };
  }
}
