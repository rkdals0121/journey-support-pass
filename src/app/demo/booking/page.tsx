import { ArrowRight, CircleCheck, Info, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { langOf } from "@/lib/i18n";

export const metadata: Metadata = { title: "예매 완료 화면 (시연)" };

// 제안서 1단계: 항공권 예매가 끝난 화면에 Journey Support Pass 링크와 권유 문구를 둔다.
// 이 화면은 그 모습을 보여 주는 시연용 모의 화면이다. 실제 항공사나 예약 사이트의 이름과 모양을 쓰지 않는다.
// 링크에는 여객의 예약 정보를 싣지 않는다(공항은 예약 정보를 받지 않는다). 들어온 접점(via=booking)만 붙여 건수를 따로 센다.
// 권유 문구는 우대나 혜택처럼 보이지 않게, 필요한 도움을 미리 알려 두는 곳으로 쉬운 말로 쓴다(제안서).
const TEXT = {
  ko: {
    notice: "시연용 모의 화면입니다. 실제 항공사나 예약 사이트의 화면이 아닙니다.",
    done: "항공권 예매가 완료되었습니다",
    itinerary: "여정",
    route: "인천(ICN) → 도쿄(NRT)",
    date: "출발",
    dateValue: "예매한 날짜",
    ref: "예약번호",
    pax: "탑승객",
    paxValue: "성인 1명",
    linkTitle: "공항에서 필요한 도움이 있으신가요?",
    linkBody: "필요한 도움을 미리 한 번 알려 두면, 공항에서 같은 설명을 되풀이하지 않고 더 편하게 이동하실 수 있습니다. 1~2분이면 됩니다.",
    linkButton: "필요한 도움 미리 알려 두기",
    smsTitle: "링크를 둘 수 없을 때: 예약 확인 문자",
    sms: "[예약 확인] 항공권 예매가 완료되었습니다.\n공항에서 필요한 도움이 있으시면 미리 알려 주세요.\n→ Journey Support Pass 링크",
    other: "그 밖의 대체 접점: 예약 확인 메일, 항공사 예약 조회 화면, 공항 홈페이지",
    back: "Journey Support Pass 첫 화면으로",
  },
  en: {
    notice: "Demo screen only. This is not a real airline or travel booking site.",
    done: "Your flight is booked",
    itinerary: "Trip",
    route: "Incheon (ICN) → Tokyo (NRT)",
    date: "Departure",
    dateValue: "Your booked date",
    ref: "Booking ref.",
    pax: "Passengers",
    paxValue: "1 adult",
    linkTitle: "Do you need any help at the airport?",
    linkBody: "Tell us once, in advance, what help you need. You will not have to explain it again and again at the airport. It takes a minute or two.",
    linkButton: "Tell us the help you need",
    smsTitle: "If a link cannot be placed here: booking text message",
    sms: "[Booking confirmed] Your flight is booked.\nIf you need any help at the airport, let us know in advance.\n→ Journey Support Pass link",
    other: "Other ways in: booking e-mail, the airline's booking page, the airport website",
    back: "Journey Support Pass home",
  },
};

export default async function BookingDemo({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = langOf((await searchParams).lang);
  const t = TEXT[lang];
  const q = lang === "en" ? "&lang=en" : "";
  return (
    <main className="page booking-demo" lang={lang}>
      <p className="fine" role="note">
        <Info size={16} aria-hidden="true" /> {t.notice}
      </p>

      <p className="success-head">
        <CircleCheck size={28} aria-hidden="true" />
        {t.done}
      </p>
      <section className="booking-card" aria-label={t.itinerary}>
        <dl>
          <dt>{t.itinerary}</dt>
          <dd>{t.route}</dd>
          <dt>{t.date}</dt>
          <dd>{t.dateValue}</dd>
          <dt>{t.ref}</dt>
          <dd className="num">DEMO01</dd>
          <dt>{t.pax}</dt>
          <dd>{t.paxValue}</dd>
        </dl>
      </section>

      <section className="booking-link">
        <h1>{t.linkTitle}</h1>
        <p>{t.linkBody}</p>
        <Link className="btn btn-primary" href={`/prepare?via=booking${q}`}>
          {t.linkButton}
          <ArrowRight size={22} aria-hidden="true" />
        </Link>
      </section>

      <h2>
        <MessageSquareText size={20} aria-hidden="true" /> {t.smsTitle}
      </h2>
      <p className="booking-sms">{t.sms}</p>
      <p className="fine">{t.other}</p>

      <Link className="btn btn-ghost" href={lang === "en" ? "/?lang=en" : "/"}>
        {t.back}
      </Link>
    </main>
  );
}
