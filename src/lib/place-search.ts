import { GATE_PICKUP_POINTS, PLACES, type Area, type Place } from "./airport";
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
/** OCR text is untrusted. Only gate-context digits or a wholly numeric query become gate hints. */
export function matchPlaces(
  text: string,
  area: LocationArea = "all",
  mode: "search" | "photo" = "search",
): PlaceMatches {
  const raw = text.normalize("NFKC").slice(0, 4000),
    numbers = new Set<number>();
  const take = (value: string) => {
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
  if (numbers.size === 0) {
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
