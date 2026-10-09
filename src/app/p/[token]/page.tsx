import { CircleSlash, SearchX } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import QRCode from "qrcode";
import { lookupPass } from "@/lib/api/public";
import { prefsOf } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { lastSuccessfulPoll } from "@/lib/flights/ingest";
import { buildGuide } from "@/lib/guide";
import { textOf } from "@/lib/i18n";
import { passUrl } from "@/lib/pass-format";
import { pollState } from "@/lib/timing";
import { Brand } from "../../components/Sunflower";
import { PassView } from "./PassView";

export const dynamic = "force-dynamic";

// 패스 QR 이 가리키는 주소. 이 주소가 곧 패스다.
// 여객이 등록을 마치면 여기로 오고, 휴대전화 기본 카메라로 QR 을 찍어도 여기로 온다.
// 이름은 애초에 받지 않으므로 여기 나오는 것은 항공편과 고른 항목뿐이다.
export default async function PassPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { token } = await params;
  const now = new Date();
  const db = await getDb();
  const found = await lookupPass(db, token, now);

  if (found.kind !== "ok") {
    const ended = found.kind === "ended";
    const ko = textOf("ko");
    const en = textOf("en");
    return (
      <main className="page">
        <Brand />
        <div className="empty">
          <span className="bubble bubble-sun">
            {ended ? <CircleSlash size={28} aria-hidden="true" /> : <SearchX size={28} aria-hidden="true" />}
          </span>
          <h1>{ended ? ko.passEnded : ko.passUnknown}</h1>
          <p>{ended ? ko.passEndedBody : ko.passUnknownBody}</p>
          <p lang="en" className="muted">
            {ended ? en.passEndedBody : en.passUnknownBody}
          </p>
        </div>
        <Link className="btn btn-primary" href="/register">
          {ko.again}
        </Link>
      </main>
    );
  }

  const guide = buildGuide(found.journey, found.passNo, null, pollState(await lastSuccessfulPoll(db), now));
  // QR 은 서버에서 미리 그려 보낸다. 느린 휴대전화에서도 화면을 열자마자 QR 이 보인다.
  // 주소는 여객이 지금 연 그 주소를 따른다.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const qr = await QRCode.toString(passUrl(`${proto}://${host}`, found.token), { type: "svg", errorCorrectionLevel: "M", margin: 4 });
  const prefs = prefsOf(found.journey.choices);
  const early = [
    prefs.large ? 'document.documentElement.setAttribute("data-large","")' : "",
    prefs.picture ? 'document.documentElement.setAttribute("data-picture","")' : "",
    `document.documentElement.lang=${JSON.stringify(found.journey.lang)}`,
  ]
    .filter(Boolean)
    .join(";");
  return (
    <>
      {/* 큰 글씨·그림·언어는 화면을 그리기 전에 적용한다. 보통 글씨로 잠깐 보였다가 커지지 않게 한다. */}
      <script dangerouslySetInnerHTML={{ __html: early }} />
      <PassView token={found.token} initial={guide} qr={qr} isNew={(await searchParams).new === "1"} />
    </>
  );
}
