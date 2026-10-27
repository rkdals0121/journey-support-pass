import { PICKUP_PLACES, type Place } from "@/lib/airport";
/** Schematic of the existing demo location data, never an official indoor map. */
export function PlaceMap({
  place,
  en = false,
}: {
  place: Place;
  en?: boolean;
}) {
  const peers = PICKUP_PLACES.filter(
    (p) =>
      p.area === place.area &&
      p.level === place.level &&
      p.landside === place.landside,
  );
  const min = Math.min(place.x, ...peers.map((p) => p.x)),
    max = Math.max(place.x, ...peers.map((p) => p.x));
  const x = max === min ? 380 : 65 + (630 * (place.x - min)) / (max - min);
  const label = en ? place.labelEn : place.label;
  return (
    <figure className="place-map">
      <svg
        viewBox="0 0 760 180"
        role="img"
        aria-label={(en ? "Selected location: " : "선택 위치: ") + label}
      >
        <rect
          x="1"
          y="1"
          width="758"
          height="178"
          rx="12"
          fill="#f2f7f3"
          stroke="#d7e3da"
        />
        <path
          d="M45 102H715"
          stroke="#d9e5dc"
          strokeWidth="24"
          strokeLinecap="round"
        />
        <text x="28" y="34" fill="#375746" fontSize="16">
          {place.area === "CONCOURSE"
            ? en
              ? "Concourse"
              : "탑승동"
            : place.area}{" "}
          · {place.level < 0 ? "B" + -place.level : place.level + "F"}
        </text>
        {[...new Map(peers.map((p) => [p.x, p])).values()]
          .filter((_, i, a) => i % Math.max(1, Math.ceil(a.length / 5)) === 0)
          .map((p) => {
            const px =
              max === min ? 380 : 65 + (630 * (p.x - min)) / (max - min);
            const gate = /(?:Gate |번 탑승구)/.test(p.labelEn + p.label)
              ? p.label.match(/(\d+)번/)?.[1]
              : null;
            return (
              <g key={p.id}>
                <circle cx={px} cy="102" r="5" fill="#85998b" />
                {gate && (
                  <text
                    x={px}
                    y="150"
                    textAnchor="middle"
                    fontSize="16"
                    fill="#52675a"
                  >
                    {gate}
                  </text>
                )}
              </g>
            );
          })}
        <path
          d={`M${x} 104 l-10 -22 a15 15 0 1 1 20 0Z`}
          fill="#236246"
          stroke="white"
          strokeWidth="3"
        />
        <circle cx={x} cy="70" r="5" fill="white" />
      </svg>
      <figcaption>
        {en
          ? "Location diagram · demo, not to scale"
          : "위치 참고도 · 시연, 실제 축척 아님"}
      </figcaption>
    </figure>
  );
}
