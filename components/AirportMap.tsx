"use client";

import { useEffect, useRef, useState } from "react";

export type Checkpoint = {
  id: string; name: string; number: number; building: 1 | 2; floor: "3F";
  lon: number; lat: number; node: number; area: "LAND"; entranceId: number;
  entranceDistance: number; status: "demo";
};

export type MapLocation =
  | { checkpointId: string; label?: string }
  | { poiId: string | number; label?: string }
  | { lon: number; lat: number; label?: string };

export type MapState = {
  building?: 1 | 2 | 3;
  /** Select a registered entrance checkpoint. Disable after matching. */
  checkpointSelection?: boolean;
  showCheckpoints?: boolean;
  markers?: Partial<
    Record<"user" | "robot" | "checkpoint" | "destination", MapLocation | null>
  >;
  route?: { start: MapLocation; end: MapLocation } | null;
  /** Set false for frequent robot/GPS updates to preserve the user's zoom. */
  fit?: boolean;
};

export type Facility = {
  id: string | number;
  name: string;
  building: 1 | 2 | 3;
  floor: "3F";
  lon: number;
  lat: number;
  category: number;
  area: string;
  description: string;
};

type Props = {
  state?: MapState;
  height?: number | string;
  className?: string;
  onCheckpointChange?: (checkpoint: Checkpoint) => void;
  onCheckpointSelect?: (checkpoint: Checkpoint) => void;
  onFacilityClick?: (facility: Facility) => void;
  onMapClick?: (location: { lon: number; lat: number }) => void;
  onRoute?: (
    route: { distance: number; coordinates: [number, number][] } | null,
  ) => void;
  onError?: (message: string) => void;
  onReady?: () => void;
};

const CHANNEL = "journey-airport-map";

/** Copy this file into the existing Next.js/React project's components folder. */
export default function AirportMap({
  state = {},
  height = 420,
  className,
  ...callbacks
}: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const handlers = useRef(callbacks);
  const [ready, setReady] = useState(false);
  const stateJson = JSON.stringify(state);

  useEffect(() => {
    handlers.current = callbacks;
  });

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const message = event.data;
      if (!message || message.channel !== CHANNEL || message.version !== 1)
        return;
      if (message.type === "ready") {
        setReady(true);
        handlers.current.onReady?.();
      }
      if (message.type === "checkpoint-select")
        handlers.current.onCheckpointSelect?.(message.location);
      if (message.type === "checkpoint-change")
        handlers.current.onCheckpointChange?.(message.location);
      if (message.type === "facility-click")
        handlers.current.onFacilityClick?.(message.facility);
      if (message.type === "map-click")
        handlers.current.onMapClick?.(message.location);
      if (message.type === "route-result")
        handlers.current.onRoute?.(message.route);
      if (message.type === "error") handlers.current.onError?.(message.message);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage(
      {
        channel: CHANNEL,
        version: 1,
        type: "set-state",
        state: JSON.parse(stateJson),
      },
      window.location.origin,
    );
  }, [ready, stateJson]);

  return (
    <iframe
      ref={frame}
      title="공항 실내지도"
      src="/airport-map/index.html"
      loading="eager"
      className={className}
      style={{
        display: "block",
        width: "100%",
        height,
        minHeight: 280,
        border: 0,
        borderRadius: 16,
      }}
      onLoad={() => {
        setReady(false);
        frame.current?.contentWindow?.postMessage(
          { channel: CHANNEL, version: 1, type: "ping" },
          window.location.origin,
        );
      }}
    />
  );
}
