import { GATE_PICKUP_POINTS, PLACES, type Area, type Place } from "./airport";
import { LANDSIDE, type LandsideSpot } from "./landside-places";
export type LocationArea = Area | "all";
export interface PlaceCandidate {
  place: Place;
  gate?: number;
}
export interface PlaceMatches {
  candidates: PlaceCandidate[];
  gates: number[];
  unsupported: number[];
  conflict: boolean;
  ambiguous: boolean;
}
const fold = (text: string) =>
  text
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\s·.,()\-]/g, "");
const aliases: Record<string, string[]> = {
  "t1-info": ["안내데스크", "information desk"],
  "t2-help": ["안내데스크", "헬프데스크", "help desk", "information desk"],
  "t1-care": ["안심여행센터", "assistance centre"],
  "t1-arrivals-demo": ["도착장", "arrivals"],
  "t2-arrivals-demo": ["도착장", "arrivals"],
  "cc-train": ["셔틀트레인", "shuttle train"],
};
function inferredArea(text: string): LocationArea {
  if (/탑승동|concourse/i.test(text)) return "CONCOURSE";
  const t1 = /(?:제?\s*1\s*(?:여객)?터미널|terminal\s*1|\bt1\b)/i.test(text),
    t2 = /(?:제?\s*2\s*(?:여객)?터미널|terminal\s*2|\bt2\b)/i.test(text);
  return t1 !== t2 ? (t1 ? "T1" : "T2") : "all";
}
// 공항 외부 표지의 말. 이런 말이 있으면 숫자를 게이트 번호로 읽지 않는다("3번 출입구"는 3번 탑승구가 아니다).
const LANDSIDE_WORDS = /출입구|출구|door|exit|택시|taxi|승차장|정류장|버스|bus|셔틀|shuttle|주차|parking|car\s*park|구역|zone|교통센터|transportation/i;
const GATE_WORDS = /gates?\b|게이트|탑승구/i;
// 택시 승차장 표기(5C, 14C)와 장기주차장(P1~P5).
const TAXI_CODE = /(?<![\dA-Za-z])(\d{1,2})\s*([A-D])(?![A-Za-z])/gi;
const LONG_TERM = /(?<![A-Za-z])P\s*([1-5])(?!\d)/gi;

/**
 * 공항 외부 위치(출입구, 택시·버스 승차장, 주차장 구역)를 찾는다. 표지 값(출입구 번호, 승차장 표기, 주차 구역)이 있으면 그것으로,
 * 없으면 이름으로 찾는다("택시", "단기주차장").
 */
function matchLandside(raw: string, fits: (p: Place) => boolean): LandsideSpot[] {
  const hits = new Set<LandsideSpot>();
  const add = (kind: LandsideSpot["kind"], code: string) => {
    for (const s of LANDSIDE) if (s.kind === kind && s.codes.includes(code)) hits.add(s);
  };
  for (const m of raw.matchAll(/(?<!\d)(\d{1,2})\s*(?:번\s*)?(?:출입구|출구|door|exit)/gi)) add("door", String(Number(m[1])));
  for (const m of raw.matchAll(/(?:출입구|출구|door|exit)\s*[:#-]?\s*(\d{1,2})(?!\d)/gi)) add("door", String(Number(m[1])));
  for (const m of raw.matchAll(TAXI_CODE)) add("taxi", `${Number(m[1])}${m[2].toUpperCase()}`);
  for (const m of raw.matchAll(LONG_TERM)) add("parking", `P${m[1]}`);
  if (/주차|parking|car\s*park|구역|zone/i.test(raw)) {
    // 제1여객터미널 단기주차장의 A·C·D·H 구역, 제2여객터미널 단기주차장의 110~269 구역.
    for (const m of raw.matchAll(/(?<![A-Za-z])([ACDH])\s*(?:구역|zone)|(?:zone|구역)\s*([ACDH])(?![A-Za-z])/gi))
      add("parking", (m[1] ?? m[2]).toUpperCase());
    for (const m of raw.matchAll(/(?<!\d)(1[1-6]\d|2[1-6]\d)(?!\d)/g)) add("parking", m[1]);
  }
  let found = [...hits].filter((s) => fits(s.place));
  if (hits.size === 0) {
    // 가장 길게 맞은 이름을 가진 곳만 남긴다. "셔틀버스"는 "버스"에도 맞지만 셔틀버스 승차장만 보여야 한다.
    const q = fold(raw);
    const score = (s: LandsideSpot) =>
      Math.max(
        0,
        ...[s.place.label, s.place.labelEn, ...s.aliases].map((name) => {
          const n = fold(name);
          return n.length >= 2 && (q.includes(n) || n.includes(q)) ? Math.min(n.length, q.length) : 0;
        }),
      );
    const scored = LANDSIDE.filter((s) => fits(s.place)).map((s) => ({ s, n: score(s) }));
    const best = Math.max(0, ...scored.map((x) => x.n));
    found = best > 0 ? scored.filter((x) => x.n === best).map((x) => x.s) : [];
  }
  return found;
}

/** OCR text is untrusted. Only gate-context digits or a wholly numeric query become gate hints. */
export function matchPlaces(
  text: string,
  area: LocationArea = "all",
  mode: "search" | "photo" = "search",
): PlaceMatches {
  const raw = text.normalize("NFKC").slice(0, 4000),
    numbers = new Set<number>();
  // 공항 외부 표지의 말이 있고 게이트라는 말은 없으면, 숫자를 게이트 번호로 읽지 않는다.
  const landside = (LANDSIDE_WORDS.test(raw) || TAXI_CODE.test(raw) || /^\s*P\s*[1-5]\s*$/i.test(raw)) && !GATE_WORDS.test(raw);
  TAXI_CODE.lastIndex = 0;
  const take = (value: string) => {
    if (landside) return;
    const n = Number(value.replace(/[iIlL]/g, "1").replace(/[oO]/g, "0"));
    if (Number.isInteger(n)) numbers.add(n);
  };
  if (/^\s*\d{1,3}\s*(?:번)?\s*$/.test(raw)) take(raw.replace(/[^\d]/g, ""));
  if (mode === "search")
    for (const m of raw.matchAll(
      /(?<!\d)(\d{1,3})\s*번(?:\s*(?:앞|근처|옆))?/g,
    ))
      take(m[1]);
  for (const pattern of [
    /(?:gates?|게이트|탑승구)\s*[:#-]?\s*([0-9iIlLoO]{1,3})(?!\d)/gi,
    /(?<![\dA-Za-z])([0-9iIlLoO]{1,3})\s*(?:번\s*)?(?:gate\b|게이트|탑승구)/gi,
  ])
    for (const m of raw.matchAll(pattern)) take(m[1]);
  const hint = inferredArea(raw),
    filter = area !== "all" ? area : hint;
  const points = [...numbers].map((g) => ({
    gate: g,
    place: GATE_PICKUP_POINTS.find((p) => p.gate === g)?.place,
  }));
  const floorMatch = raw.match(
    /(?:지하\s*([1-9])\s*층|\bB\s*([1-9])\b|([1-9])\s*(?:층|F\b))/i,
  );
  const floor = floorMatch
    ? floorMatch[1] || floorMatch[2]
      ? -Number(floorMatch[1] || floorMatch[2])
      : Number(floorMatch[3])
    : undefined;
  const fits = (p: Place) =>
    (filter === "all" || p.area === filter) &&
    (floor === undefined || p.level === floor);
  const unsupported = points.filter((p) => !p.place).map((p) => p.gate);
  const conflict = points.some((p) => p.place && !fits(p.place));
  let candidates: PlaceCandidate[] = points.filter(
    (p): p is { gate: number; place: Place } => !!p.place && fits(p.place),
  );
  if (landside) {
    candidates = matchLandside(raw, fits).map((s) => ({ place: s.place }));
  } else if (numbers.size === 0) {
    const q = fold(raw);
    if (q.length >= 2)
      candidates = PLACES.filter(
        (p) =>
          fits(p) &&
          [p.label, p.labelEn, ...(aliases[p.id] ?? [])].some((name) => {
            const n = fold(name);
            return mode === "photo"
              ? n.length >= 3 && q.includes(n)
              : n.includes(q) || q.includes(n);
          }),
      ).map((place) => ({ place }));
  }
  const ambiguous =
    candidates.length > 1 || /\d\s*[~–—-]\s*\d|\bGATES\b|방향|→|←/i.test(raw);
  return {
    candidates: candidates.slice(0, 6),
    gates: [...numbers],
    unsupported,
    conflict,
    ambiguous,
  };
}
