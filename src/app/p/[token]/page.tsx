import { CircleSlash, SearchX } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import QRCode from "qrcode";
import { lookupPass } from "@/lib/api/public";
import { prefsOf } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { lastSuccessfulPoll } from "@/lib/flights/ingest";
import { buildGuide } from "@/lib/guide";
import { textOf } from "@/lib/i18n";
import { passUrl, TOKEN_RE } from "@/lib/pass-format";
import { pollState } from "@/lib/timing";
import { Brand } from "../../components/Sunflower";
import { PassView } from "./PassView";

export const dynamic = "force-dynamic";

// 이 화면을 홈 화면에 추가하면 첫 화면이 아니라 이 패스가 열리게, 패스마다 따로 만든 매니페스트를 건다(./manifest/route.ts).
// QR 값의 모양만 본다. 모양이 틀린 주소는 사이트 전체의 매니페스트가 그대로 쓰인다.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const token = (await params).token.toUpperCase();
  return TOKEN_RE.test(token) ? { manifest: `/p/${token}/manifest` } : {};
}

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
    // 패스가 끝나면 여객이 어느 말로 등록했는지 알 수 없으므로 한국어와 영어를 함께 보여 준다.
    // 다시 등록하는 단추도 말마다 따로 둔다. 영어 단추는 영어 등록 화면을 열고, 읽어 주는 소리도 그 말로 나온다.
    return (
      <main className="page">
        <Brand />
        <div className="empty">
          <span className="bubble bubble-sun">
            {ended ? <CircleSlash size={28} aria-hidden="true" /> : <SearchX size={28} aria-hidden="true" />}
          </span>
          <h1>{ended ? ko.passEnded : ko.passUnknown}</h1>
          <p lang="en" className="muted">
            {ended ? en.passEnded : en.passUnknown}
          </p>
          <p>{ended ? ko.passEndedBody : ko.passUnknownBody}</p>
          <p lang="en" className="muted">
            {ended ? en.passEndedBody : en.passUnknownBody}
          </p>
        </div>
        <Link className="btn btn-primary" href="/register">
          {ko.again}
        </Link>
        <Link className="btn" href="/register?lang=en" hrefLang="en" lang="en">
          {en.again}
        </Link>
      </main>
    );
  }

  const guide = buildGuide(found.journey, found.passNo, null, pollState(await lastSuccessfulPoll(db), now), now);
  // QR 은 서버에서 미리 그려 보낸다. 느린 휴대전화에서도 화면을 열자마자 QR 이 보인다.
  // 주소는 여객이 지금 연 그 주소를 따른다.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const qr = await QRCode.toString(passUrl(`${proto}://${host}`, found.token), { type: "svg", errorCorrectionLevel: "M", margin: 4 });
  const prefs = prefsOf(found.journey.choices);
  const early = [
    prefs.large ? 'document.documentElement.style.setProperty("--scale","1.25")' : "",
    prefs.picture ? 'document.documentElement.setAttribute("data-picture","")' : "",
    `document.documentElement.lang=${JSON.stringify(found.journey.lang)}`,
    // 등록하면서 「설정」에서 바꾼 글자 크기가 있으면 그 크기로 시작한다.
    'try{var v=JSON.parse(sessionStorage.getItem("jsp:view")||"{}");if(typeof v.scale==="number")document.documentElement.style.setProperty("--scale",String(v.scale))}catch(e){}',
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
