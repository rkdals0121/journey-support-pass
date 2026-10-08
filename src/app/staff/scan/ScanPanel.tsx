"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorNote } from "../../components/Alert";
import { Scanner } from "../../components/Scanner";

const MESSAGES: Record<string, string> = {
  idle: "연결되지 않은 패스입니다",
  unusable: "사용할 수 없는 패스입니다",
  unknown: "패스 QR이 아닙니다",
};

export function ScanPanel({ isDesk }: { isDesk: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 안내데스크가 미사용 패스를 찍었을 때, 다시 찍지 않고 그 패스로 연결하러 갈 수 있게 들고 있는다.
  const [idleToken, setIdleToken] = useState<string | null>(null);
  const lastScanned = useRef("");

  async function resolve(body: { scanned: string } | { passNo: string }) {
    if (busy) return;
    // 같은 QR 이 계속 비치는 동안에는 다시 묻지 않는다. 안내 문구와 버튼이 깜박이지 않는다.
    if ("scanned" in body) {
      if (body.scanned === lastScanned.current) return;
      lastScanned.current = body.scanned;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/staff/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      if (res.status === 409) {
        router.replace("/staff/zone");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "확인하지 못했습니다");
      } else if (data.kind === "active") {
        router.push(`/staff/case/${data.registrationId}`);
        return;
      } else if ("passNo" in body) {
        setMessage("패스 번호를 찾을 수 없습니다");
      } else {
        // 패스 모양의 주소인데 이 서버에 없는 것과, 아예 패스가 아닌 QR 을 구분해 알려 준다.
        const looksLikePass = /\/p\/[A-Za-z0-9_-]{24}\/?$/.test(body.scanned.trim());
        setMessage(
          data.kind === "unknown" && looksLikePass
            ? "QR은 읽었지만 이 사이트에 등록된 패스가 아닙니다. 예시용 QR이거나 다른 서버에서 만든 패스입니다."
            : data.kind === "unknown"
              ? `패스 QR이 아닙니다. (읽은 내용: ${body.scanned.trim().slice(0, 40)})`
              : (MESSAGES[data.kind] ?? MESSAGES.unknown),
        );
        if (data.kind === "idle" && "scanned" in body) {
          setIdleToken(/([A-Za-z0-9_-]{24})\/?$/.exec(body.scanned.trim())?.[1] ?? null);
        }
      }
    } catch {
      lastScanned.current = "";
      setMessage("연결할 수 없습니다. 여객에게 구두로 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>패스 스캔</h1>
      <p className="muted">패스 뒷면의 QR을 네모 안에 맞춰 주세요.</p>
      <Scanner
        onScan={(text) => resolve({ scanned: text })}
        onNumber={(passNo) => resolve({ passNo })}
        numberLabel="여객 카드 열기"
        paused={busy}
      />
      {message && <ErrorNote>{message}</ErrorNote>}
      {isDesk && message === MESSAGES.idle && (
        <Link className="btn btn-primary" href={idleToken ? `/staff/desk?token=${idleToken}` : "/staff/desk"}>
          이 패스로 연결하러 가기
        </Link>
      )}
    </div>
  );
}
