import {
  GATE_PICKUP_POINTS,
  placeOf,
  routeToGate,
  routeOptionsOf,
} from "./airport";
import { SERVICE_HUBS, hubOf } from "./service-hubs";

/** Prototype itinerary: never sends a traveller between terminals or back through security. */
export function stampRoute(
  gate: string,
  origin = "t1-departure",
  boardingAt = "",
  now = Date.now(),
) {
  const target = GATE_PICKUP_POINTS.find((p) => p.gate === Number(gate));
  const start = hubOf(origin);
  const blocked = (reason: string) => ({
    indices: [] as number[],
    minutes: 0,
    reason,
  });
  if (!target || !gate.trim()) return blocked("탑승구 번호를 입력해 주세요.");
  if (!start) return blocked("현재 거점을 선택해 주세요.");
  const t2 = target.place.area === "T2";
  if (start.id.startsWith("t2") !== t2)
    return blocked(
      "현재 터미널과 탑승구가 달라요. 터미널을 먼저 확인해 주세요.",
    );
  const concourse = target.place.area === "CONCOURSE";
  if (start.id === "concourse" && !concourse)
    return blocked("탑승동에서 되돌아가는 경로는 제공하지 않아요.");
  let ids = t2
    ? ["t2-departure", "t2-airside"]
    : concourse
      ? ["t1-departure", "t1-airside", "concourse"]
      : ["t1-departure", "t1-airside"];
  const startIndex = ids.indexOf(start.id);
  if (startIndex >= 0) ids = ids.slice(startIndex);
  else if (start.id === "t1-care")
    ids = ["t1-care", ...ids.filter((id) => id !== "t1-departure")];
  const indices = ids.map((id) => SERVICE_HUBS.findIndex((h) => h.id === id));
  // Conservative demonstration allowance, including security / train transfer.
  const finalHub = hubOf(ids[ids.length - 1])!;
  const finalLeg = routeToGate(
    placeOf(finalHub.placeId)!,
    target.place.area,
    Number(gate),
    routeOptionsOf([]),
  );
  if (!finalLeg)
    return blocked(
      "탑승구까지의 경로를 확인할 수 없어요. 현장 직원에게 확인해 주세요.",
    );
  const minutes =
    ids.length * 5 +
    (ids.some((id) => id.endsWith("departure") || id === "t1-care") ? 30 : 0) +
    (concourse && start.id !== "concourse" ? 15 : 0) +
    finalLeg.minutes;
  if (boardingAt) {
    const boarding = new Date(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(boardingAt)
        ? boardingAt + "+09:00"
        : boardingAt,
    ).getTime();
    if (!Number.isFinite(boarding))
      return blocked("탑승 시각을 확인해 주세요.");
    if (boarding - now < (minutes + 15) * 60000)
      return blocked(
        "탑승 시각이 가까워요. 도장 수집 대신 탑승구로 바로 이동해 주세요.",
      );
  }
  return { indices, minutes, reason: "" };
}

/** The same eligibility policy is used by camera, uploaded image, typed code and QR URL. */
export function stampEligibility(
  s: {
    mode: "play" | "route";
    gate: string;
    startHub?: string;
    boardingAt?: string;
  },
  now = Date.now(),
) {
  if (s.mode === "route")
    return stampRoute(s.gate, s.startHub, s.boardingAt, now);
  const start = hubOf(s.startHub);
  const blocked = (reason: string) => ({
    indices: [] as number[],
    minutes: 0,
    reason,
  });
  if (!start) return blocked("현재 거점을 선택해 주세요.");
  const place = placeOf(start.placeId)!;
  const indices = SERVICE_HUBS.flatMap((h, i) => {
    const p = placeOf(h.placeId)!;
    return p.area === place.area && p.landside === place.landside ? [i] : [];
  });
  const minutes = indices.length * 5;
  if (s.boardingAt) {
    const at = new Date(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.boardingAt)
        ? s.boardingAt + "+09:00"
        : s.boardingAt,
    ).getTime();
    if (!Number.isFinite(at)) return blocked("탑승 시각을 확인해 주세요.");
    if (at - now < (minutes + 30) * 60000)
      return blocked(
        "탑승 시각이 가까워요. 도장 수집 대신 탑승구로 바로 이동해 주세요.",
      );
  }
  return { indices, minutes, reason: "" };
}
