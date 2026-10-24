import { CircleSlash, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { lookupPass } from "@/lib/api/public";
import { prefsOf } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { lastSuccessfulPoll } from "@/lib/flights/ingest";
import { buildGuide } from "@/lib/guide";
import { textOf } from "@/lib/i18n";
import { TOKEN_RE } from "@/lib/pass-format";
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

// 여객의 등록 현황. 여객이 등록을 마치면 여기로 온다.
// 이 화면에는 여객이 공항에서 보여 줄 QR 이 없다(피드백 2). 체크인하면 전자토큰이 탑승권에 저장되고, 여객은 탑승권만 보여 준다.
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
  // 체크인했으면 모의 탑승권의 바코드(BP1)를 서버에서 미리 그려 보낸다. 항공사가 주는 탑승권을 흉내 낸 것이고,
  // 키오스크·우대출구는 이 탑승권으로 등록을 찾는다. 서비스 전용 QR(패스 주소)은 여객에게 보여 주지 않는다.
  const boarding = found.journey.boarding;
  const qr = boarding ? await QRCode.toString(boarding, { type: "svg", errorCorrectionLevel: "M", margin: 4 }) : "";
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
