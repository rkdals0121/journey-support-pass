"use client";
import { useEffect, useState } from "react";
export function PushSettings() {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("브라우저 알림 설정 확인 중…");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (live)
          setStatus(
            "이 브라우저는 백그라운드 알림을 지원하지 않습니다. 화면 내 알림을 이용해 주세요.",
          );
        return;
      }
      try {
        const response = await fetch("/api/staff/push", {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const data = await response.json();
        if (!live) return;
        if (!response.ok || !data.enabled) {
          setStatus(
            "백그라운드 알림: 운영 설정이 필요합니다. 현재는 화면 내 알림을 이용해 주세요.",
          );
          return;
        }
        setKey(data.publicKey);
        const registration =
          await navigator.serviceWorker.getRegistration("/staff/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          // Refresh the zone and session expiry after every staff login/zone change.
          const saved = await fetch("/api/staff/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription }),
            signal: AbortSignal.timeout(10000),
          });
          if (!saved.ok) throw new Error();
        }
        if (live) {
          setActive(!!subscription);
          setStatus(
            subscription
              ? "이 기기의 브라우저 알림이 켜져 있습니다. 로그인 세션이 끝나면 알림도 중단됩니다."
              : "다른 앱을 보는 동안 알림을 받으려면 이 기기에서 알림을 켜 주세요.",
          );
        }
      } catch {
        if (live)
          setStatus(
            "알림 설정을 확인하지 못했습니다. 화면을 새로 열어 주세요.",
          );
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.register(
        "/staff/staff-request-sw.js",
        { scope: "/staff/" },
      );
      let subscription = await registration.pushManager.getSubscription();
      if (active) {
        if (subscription) {
          const result = await fetch("/api/staff/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription }),
            signal: AbortSignal.timeout(10000),
          });
          if (!result.ok)
            throw new Error(
              "알림 해제를 저장하지 못했습니다. 다시 시도해 주세요.",
            );
          await subscription.unsubscribe();
        }
        setActive(false);
        setStatus("이 기기의 브라우저 알림을 껐습니다.");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted")
          throw new Error(
            "알림 권한이 허용되지 않았습니다. 브라우저 설정에서 변경할 수 있습니다.",
          );
        if (!registration.active)
          await new Promise<void>((resolve, reject) => {
            const worker = registration.installing ?? registration.waiting;
            if (!worker) {
              reject(
                new Error("알림 준비 중입니다. 잠시 후 다시 시도해 주세요."),
              );
              return;
            }
            const timer = setTimeout(
              () => reject(new Error("알림 준비 시간이 초과되었습니다.")),
              10000,
            );
            worker.addEventListener("statechange", () => {
              if (worker.state === "activated") {
                clearTimeout(timer);
                resolve();
              }
            });
          });
        const bytes = Uint8Array.from(
          atob(key.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        );
        subscription ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        });
        const response = await fetch("/api/staff/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          await subscription.unsubscribe();
          throw new Error("알림 등록에 실패했습니다. 다시 시도해 주세요.");
        }
        setActive(true);
        setStatus(
          "이 기기의 브라우저 알림을 켰습니다. 알림에는 여객의 상세 내용을 표시하지 않습니다.",
        );
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "알림을 설정하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dx-notice">
      <p aria-live="polite">{status}</p>
      {key && (
        <button
          type="button"
          className="btn"
          disabled={busy}
          aria-pressed={active}
          onClick={() => void toggle()}
        >
          {busy
            ? "설정 중…"
            : active
              ? "이 기기 브라우저 알림 끄기"
              : "이 기기 브라우저 알림 켜기"}
        </button>
      )}
      <p className="muted">
        전달 여부는 기기·브라우저·네트워크 설정에 따라 달라집니다. 실제 출동
        여부는 요청 화면에서 확인합니다.
      </p>
    </div>
  );
}
