"use client";
import { useEffect, useState } from "react";
import { PLACES } from "@/lib/airport";
import type { ServiceRequestView } from "@/lib/service-request-model";
export function PickupChange({
  request: r,
  receipt,
  en,
  sharedDevice,
  disabled,
  onChanged,
  onRefresh,
}: {
  request: ServiceRequestView;
  receipt: string;
  en: boolean;
  sharedDevice: boolean;
  disabled: boolean;
  onChanged: (value: ServiceRequestView) => void;
  onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(r.pendingPlaceId ?? r.placeId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    setSelected(r.pendingPlaceId ?? r.placeId);
  }, [r.id, r.placeId, r.pendingPlaceId]);
  const tr = (ko: string, english: string) => (en ? english : ko);
  const eligible = ["received", "assigned", "en_route", "arrived"].includes(
    r.state,
  );
  if (!eligible) return null;
  async function change(action: "request" | "withdraw") {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/requests/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt,
          version: r.version,
          action,
          placeId: selected,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        const english: Record<string, string> = {
          request_stale:
            "The request changed. Review the latest pickup and try again.",
          location_stage:
            "Assistance has started or ended. Tell the staff member your location.",
          location_locked: "The pickup on this shared kiosk cannot be changed.",
          location_invalid: "Choose a new pickup point from the list.",
          location_withdraw:
            "Use Withdraw change to keep the confirmed pickup point.",
          request_expired: "This request has expired.",
        };
        throw new Error(
          en
            ? (english[data.code] ??
              "Could not change pickup. Refresh the request or contact staff.")
            : (data.error ?? "위치를 변경하지 못했습니다"),
        );
      }
      onChanged(data.request);
      setMessage(
        data.request.pendingPlaceId
          ? tr(
              "위치 변경 요청을 보냈습니다. 담당자 확인 전까지 새 위치는 확정되지 않습니다.",
              "Pickup change requested. The new point is not confirmed until staff accept.",
            )
          : tr(
              "현재 만날 곳 정보를 갱신했습니다.",
              "Your confirmed pickup information has been updated.",
            ),
      );
    } catch (e) {
      setError((e as Error).message);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="dx-notice"
      aria-label={tr("만날 곳 변경", "Change pickup")}
    >
      {r.pendingPlaceId && (
        <p role="status">
          <strong>
            {tr(
              "위치 변경 확인 대기: ",
              "Pickup change awaiting confirmation: ",
            )}
            {en ? r.pendingPlaceEn : r.pendingPlace}
          </strong>
          <br />
          {tr(
            "담당자가 수락하기 전까지 기존 만날 곳이 확정 위치입니다.",
            "The original pickup remains confirmed until staff accept the change.",
          )}
        </p>
      )}
      {sharedDevice ? (
        <p>
          {tr(
            "이 공용 기기의 설치 위치는 바꿀 수 없습니다. 다른 장소로 옮겼다면 접수 확인 QR을 휴대전화에서 열거나 안내데스크에 알려 주세요.",
            "This shared kiosk has a fixed pickup. If you moved, open your receipt QR on your phone or tell the information desk.",
          )}
        </p>
      ) : (
        <>
          <label htmlFor="pickup-change-place">
            {tr("새로 만날 곳", "New pickup point")}
          </label>
          <select
            id="pickup-change-place"
            value={selected}
            disabled={disabled || busy}
            onChange={(e) => setSelected(e.target.value)}
          >
            {PLACES.map((p) => (
              <option key={p.id} value={p.id}>
                {en ? p.labelEn : p.label}
              </option>
            ))}
          </select>
          <p className="fine">
            {r.state === "received"
              ? tr(
                  "담당 배정 전에는 새 위치를 바로 반영합니다.",
                  "Before assignment, the new pickup is applied immediately.",
                )
              : tr(
                  "담당 배정 후에는 위치 변경 요청을 보내 담당자의 확인을 받습니다.",
                  "After assignment, send a change request for staff to confirm.",
                )}
          </p>
          <button
            className="btn"
            disabled={
              disabled ||
              busy ||
              !selected ||
              selected === r.placeId ||
              selected === r.pendingPlaceId
            }
            onClick={() => void change("request")}
          >
            {r.state === "received"
              ? tr("새 만날 곳으로 변경", "Change pickup point")
              : tr("위치 변경 요청 보내기", "Request pickup change")}
          </button>
          {r.pendingPlaceId && (
            <button
              className="btn btn-ghost"
              disabled={disabled || busy}
              onClick={() => void change("withdraw")}
            >
              {tr("위치 변경 요청 철회", "Withdraw pickup change")}
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
