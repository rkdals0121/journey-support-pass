"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Area } from "@/lib/airport";
import { GATE_XY, gateArea, isGate } from "@/lib/gates";
import { AREA_LABEL, CHECKPOINTS } from "@/lib/stamp-book";
import { EXITS } from "@/lib/stamp-routing";
import { AIRSIDE_OUTLINE, EXIT_XY } from "@/lib/terminal-map";

// 경로형 "지금 있는 곳"을 지도에서 고른다. 탑승구 번호로 보여 줄 터미널을 정하고(탑승동이면 제1여객터미널과 탑승동),
// 면세구역 윤곽·탑승구·출국심사 출구는 인천국제공항 공식 지도 자료(gates.ts, terminal-map.ts)를 따른다. 점을 누르면 확인 문구를 띄우고, 맞다고 하면 고른 것으로 한다.
// 북쪽이 위다. 공식 지도도 북쪽이 위라 같은 방향으로 보인다.

/** 화면 좌표(m). 자료는 y 가 북쪽이 + 라서 뒤집는다. */
const flip = ([x, y]: [number, number]): [number, number] => [x, -y];
const at = (gate: number) => flip(GATE_XY[gate]);
const outlinePath = (area: Area) =>
  AIRSIDE_OUTLINE[area].map((r) => "M" + r.map((p) => flip(p).join(" ")).join("L") + "Z").join("");
const PAD = 70;
/** 표시 크기는 화면 픽셀 기준으로 잡는다(지도 폭을 이 정도로 보고 확대 배율로 나눈다). */
const BASE_PX = 340;
const MAX_ZOOM = 3;
/** 서편·중앙·동편: 지도를 가로로 셋으로 나눈 구역(북쪽이 위라 왼쪽이 서편). */
const ZONES = ["서편", "중앙", "동편"] as const;

interface Spot {
  id: string;
  kind: "exit" | "cp";
  x: number;
  y: number;
  mark: string;
  title: string;
}

function areaView(area: Area) {
  const gates = Object.keys(GATE_XY).map(Number).filter((g) => gateArea(g) === area);
  const xs = gates.map((g) => at(g)[0]);
  const ys = gates.map((g) => at(g)[1]);
  const x = Math.min(...xs) - PAD;
  const y = Math.min(...ys) - PAD;
  const box = { x, y, w: Math.max(...xs) + PAD - x, h: Math.max(...ys) + PAD - y };
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  const exits: Spot[] = EXITS.filter((e) => e.area === area).map((e) => ({
    id: e.id,
    kind: "exit",
    x: flip(EXIT_XY[e.id])[0],
    y: flip(EXIT_XY[e.id])[1],
    mark: e.label.replace(/^.*?(\d+번 출국장).*$/, "$1"),
    title: e.label,
  }));
  const cps: Spot[] = CHECKPOINTS.filter((c) => c.area === area).map((c) => ({
    id: c.code,
    kind: "cp",
    x: at(c.near)[0],
    y: at(c.near)[1],
    mark: c.code,
    title: `${c.code} · ${c.place}${/탑승구/.test(c.place) ? "" : ` (${c.near}번 탑승구 근처)`}`,
  }));
  return { gates, box, spots: [...exits, ...cps], cx, cy };
}

export function StartMap({ gate, value, onPick }: { gate: string; value?: string; onPick: (id: string) => void }) {
  const g = Number(gate);
  const ga = isGate(g) ? gateArea(g) : undefined;
  const areas: Area[] = !ga ? [] : ga === "CONCOURSE" ? ["T1", "CONCOURSE"] : [ga];
  const valueArea = EXITS.find((e) => e.id === value)?.area ?? CHECKPOINTS.find((c) => c.code === value)?.area;
  const [tab, setTab] = useState<Area>();
  const area = tab && areas.includes(tab) ? tab : valueArea && areas.includes(valueArea) ? valueArea : areas[0];
  const [zoom, setZoom] = useState(1);
  const [pending, setPending] = useState("");
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const view = useMemo(() => area && areaView(area), [area]);

  // 확대하거나 구역·점을 고르면 그 자리가 가운데 오게 스크롤한다.
  useEffect(() => {
    const el = viewRef.current;
    if (!el || !view || !focus) return;
    el.scrollLeft = ((focus[0] - view.box.x) / view.box.w) * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = ((focus[1] - view.box.y) / view.box.h) * el.scrollHeight - el.clientHeight / 2;
  }, [zoom, focus, view]);

  if (!area || !view) return <p className="sb-hint">탑승구 번호를 먼저 넣으면 그 터미널 지도가 나와요.</p>;

  const { box, spots, gates, cx, cy } = view;
  const u = box.w / (BASE_PX * zoom);
  const chosen = spots.find((p) => p.id === (pending || value));
  const pick = (p: Spot) => {
    setPending(p.id);
    if (zoom === 1) setZoom(2);
    setFocus([p.x, p.y]);
  };

  return (
    <section className="sb-map" aria-label="지도에서 지금 있는 곳 고르기">
      <p className="sb-map-title">지금 있는 곳 · 지도에서 고르기</p>
      {areas.length > 1 && (
        <div className="sb-tabs" role="tablist" aria-label="터미널">
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={a === area}
              onClick={() => {
                setTab(a);
                setPending("");
                setZoom(1);
                setFocus(null);
              }}
            >
              {AREA_LABEL[a]}
            </button>
          ))}
        </div>
      )}
      <div className="sb-map-tools">
        <div role="group" aria-label="구역 나눠 보기">
          <button type="button" aria-pressed={zoom === 1} onClick={() => setZoom(1)}>
            전체
          </button>
          {ZONES.map((z, k) => (
            <button
              key={z}
              type="button"
              onClick={() => {
                setZoom(Math.max(zoom, 2));
                setFocus([box.x + (box.w * (k + 0.5)) / 3, box.y + box.h / 2]);
              }}
            >
              {z}
            </button>
          ))}
        </div>
        <div role="group" aria-label="확대·축소">
          <button type="button" aria-label="축소" disabled={zoom === 1} onClick={() => setZoom(zoom - 1)}>
            <Minus aria-hidden="true" />
          </button>
          <button type="button" aria-label="확대" disabled={zoom === MAX_ZOOM} onClick={() => setZoom(zoom + 1)}>
            <Plus aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="sb-map-view" ref={viewRef}>
        <svg
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          style={{ width: `${zoom * 100}%` }}
          role="group"
          aria-label={`${AREA_LABEL[area]} 지도. 점을 누르면 지금 있는 곳으로 고를 수 있어요.`}
        >
          <path d={outlinePath(area)} className="sb-map-building" fillRule="evenodd" />
          <text x={box.x + 14 * u} y={box.y + 22 * u} className="sb-map-north" style={{ fontSize: 13 * u }}>
            ↑ 북
          </text>
          {gates.map((n) => {
            if (zoom < 2 && n % 5 !== 0) return null;
            // 탑승구 번호는 점과 겹치지 않게 터미널 바깥쪽(계류장 쪽)으로 조금 밀어 적는다.
            const [x, y] = at(n);
            const d = Math.hypot(x - cx, y - cy) || 1;
            return (
              <text key={n} x={x + ((x - cx) / d) * 20 * u} y={y + ((y - cy) / d) * 20 * u} className="sb-map-gate" style={{ fontSize: 9 * u }}>
                {n}
              </text>
            );
          })}
          {spots.map((p) => {
            const on = p.id === chosen?.id;
            return (
              <g
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={p.title}
                aria-pressed={on}
                className={`sb-map-spot sb-map-${p.kind}${on ? " on" : ""}`}
                onClick={() => pick(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick(p);
                  }
                }}
              >
                <circle cx={p.x} cy={p.y} r={18 * u} className="sb-map-hit" />
                {p.kind === "exit" ? (
                  <rect
                    x={p.x - 9 * u}
                    y={p.y - 9 * u}
                    width={18 * u}
                    height={18 * u}
                    rx={3 * u}
                    transform={`rotate(45 ${p.x} ${p.y})`}
                  />
                ) : (
                  <circle cx={p.x} cy={p.y} r={(on ? 9 : 6.5) * u} />
                )}
                {(zoom >= 2 || p.kind === "exit" || on) && (
                  <text x={p.x} y={p.y - 14 * u} style={{ fontSize: (p.kind === "exit" ? 11 : 10) * u }}>
                    {/* 전체 보기에서는 출구 이름이 겹치니 번호만 적는다. */}
                    {p.kind === "exit" && zoom < 2 && !on ? p.mark.replace(" 출국장", "") : p.mark}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="sb-map-legend" aria-hidden="true">
        <span className="dot" /> 체크포인트 <span className="diamond" /> 출국심사 출구 <b>25</b> 탑승구 번호 · 지도 자료: 인천국제공항 공식 지도
      </p>
      {pending && chosen ? (
        <div className="sb-map-confirm" role="status">
          <p>
            <strong>{chosen.title}</strong>, 여기 맞아요?
          </p>
          <div>
            <button
              type="button"
              className="sb-btn sb-btn-cta"
              onClick={() => {
                onPick(chosen.id);
                setPending("");
              }}
            >
              여기 맞아요
            </button>
            <button type="button" className="sb-link" onClick={() => setPending("")}>
              다시 고르기
            </button>
          </div>
        </div>
      ) : chosen ? (
        <p className="sb-map-now">
          지금 있는 곳: <strong>{chosen.title}</strong>
        </p>
      ) : (
        <p className="sb-hint">
          주변 탑승구 번호 표지판을 보고 그 번호 가까운 점을 눌러요. 방금 출국심사를 마쳤다면 ◆ 출구를 눌러요.
        </p>
      )}
    </section>
  );
}
