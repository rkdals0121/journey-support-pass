import { PLACES } from "./airport";
export interface QueueOptions {
  history?: boolean;
  offset?: number;
  limit?: number;
  search?: string;
  service?: string;
  source?: string;
  queue?: string;
  scope?: string;
  zone?: string;
  order?: string;
}
export function attentionPredicate(now: "$1" | "$2") {
  return `((state='received' and created_at<=${now}::timestamptz-interval '10 minutes') or (state in ('assigned','en_route','arrived','serving') and updated_at<=${now}::timestamptz-interval '30 minutes'))`;
}
export function queueQuery(options: QueueOptions, zoneId: string, now: Date) {
  if (options.search !== undefined && typeof options.search !== "string")
    throw new Error("검색어를 다시 확인해 주세요");
  const search = (options.search ?? "").trim();
  if (search.length > 80 || search.includes(String.fromCharCode(0)))
    throw new Error("검색어는 80자 이내의 텍스트로 적어 주세요");
  const allowed: Record<string, string[]> = {
    service: ["all", "guidance", "robot", "mobility"],
    source: ["all", "web", "preregistered", "kiosk", "assisted"],
    queue: ["all", "integrated", "call", "assist"],
    scope: ["all", "waiting", "mine", "location", "attention"],
    order: ["newest", "oldest", "priority"],
  };
  for (const [name, values] of Object.entries(allowed)) {
    const value = options[name as keyof QueueOptions];
    if (
      value !== undefined &&
      (typeof value !== "string" || !values.includes(value))
    )
      throw new Error("목록 필터를 다시 확인해 주세요");
  }
  if (
    options.zone !== undefined &&
    (typeof options.zone !== "string" ||
      (options.zone !== "all" && !/^[a-zA-Z0-9_-]{1,64}$/.test(options.zone)))
  )
    throw new Error("구역 필터를 다시 확인해 주세요");
  const limit = options.limit ?? 200;
  if (![25, 50, 100, 200].includes(limit))
    throw new Error("목록 건수를 다시 확인해 주세요");
  const offset = Math.max(
    0,
    Math.min(100000, Number.isInteger(options.offset) ? options.offset! : 0),
  );
  const since = new Date(
    now.getTime() - (options.history ? 90 * 86400000 : 30 * 60000),
  );
  const params: unknown[] = [now, since];
  const bind = (value: unknown) => {
    params.push(value);
    return "$" + params.length;
  };
  const active =
    "state in ('received','assigned','en_route','arrived','serving')";
  const conditions = [
    options.history
      ? "created_at >=$2 and $1::timestamptz is not null"
      : `expires_at>$1 and (${active} or ended_at>$2)`,
  ];
  for (const key of ["service", "source", "queue"] as const)
    if (options[key] && options[key] !== "all")
      conditions.push(`${key}=${bind(options[key])}`);
  if (options.zone && options.zone !== "all")
    conditions.push(`assigned_zone=${bind(options.zone)}`);
  if (options.scope === "mine")
    conditions.push(`assigned_zone=${bind(zoneId)}`);
  if (options.scope === "waiting") conditions.push("state='received'");
  if (options.scope === "location")
    conditions.push("pending_place_id is not null");
  if (options.scope === "attention") conditions.push(attentionPredicate("$1"));
  if (search) {
    const folded = search.toLocaleLowerCase("en");
    const places = PLACES.filter((p) =>
      [p.id, p.label, p.labelEn].some((text) =>
        text.toLocaleLowerCase("en").includes(folded),
      ),
    ).map((p) => p.id);
    const term = bind(search),
      ids = bind(places);
    conditions.push(
      `(position(lower(${term}) in lower(id))>0 or place_id=any(${ids}::text[]) or pending_place_id=any(${ids}::text[]))`,
    );
  }
  const order = options.order ?? "newest";
  const ordering =
    order === "priority"
      ? `case when pending_place_id is not null then 0 when ${attentionPredicate("$1")} then 1 when state='received' then 2 when ${active} then 3 else 4 end,created_at asc,id asc`
      : `(${active}) desc,created_at ${order === "oldest" ? "asc" : "desc"},id asc`;
  return {
    condition: conditions.join(" and "),
    ordering,
    params,
    offset,
    limit,
  };
}
