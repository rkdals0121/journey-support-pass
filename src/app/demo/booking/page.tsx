import { ArrowLeft, ArrowRight, CircleCheck, HeartHandshake, Info, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { langOf } from "@/lib/i18n";
import { PublicShell } from "../../components/PublicShell";
import { addDays, kstDate } from "@/lib/flights/normalize";

export const metadata: Metadata = { title: "예매 완료 화면 (시연)" };

// 제안서 1단계: 항공권 예매가 끝난 화면에 Journey Support Pass 링크와 권유 문구를 둔다.
// 이 화면은 그 모습을 보여 주는 시연용 모의 화면이다. 실제 항공사나 예약 사이트의 이름과 모양을 쓰지 않는다.
// 링크에는 예약번호나 이름을 싣지 않는다. 조회 화면에서 가상 시연값만 사용한다.
// 권유 문구는 우대나 혜택처럼 보이지 않게, 필요한 도움을 미리 알려 두는 곳으로 쉬운 말로 쓴다(제안서).
const TEXT = {
  ko: {
    notice: "시연용 모의 화면 · 실제 항공사나 예약 사이트가 아니에요",
    done: "항공권 예매가 완료되었습니다",
    itinerary: "여정",
    route: "인천(ICN) → 도쿄(NRT)",
    date: "출발",
    dateValue: "예매한 날짜",
    ref: "예약번호",
    pax: "탑승객",
    paxValue: "KIM · 가상 탑승객 1명",
    linkTitle: "공항에서 필요한 도움이 있으신가요?",
    linkBody: "한 번 알려 두면 공항에서 다시 설명하지 않아도 돼요. 1~2분이면 돼요.",
    linkButton: "필요한 도움 미리 알려 두기",
    smsTitle: "링크를 둘 수 없을 때: 예약 확인 문자",
    sms: "[예약 확인] 항공권 예매가 완료되었습니다.\n공항에서 필요한 도움이 있으시면 미리 알려 주세요.\n→ Journey Support Pass 링크",
    other: "그 밖에: 예약 확인 메일, 항공사 예약 조회, 공항 홈페이지",
    back: "첫 화면으로",
  },
  en: {
    notice: "Demo screen · not a real airline or booking site",
    done: "Your flight is booked",
    itinerary: "Trip",
    route: "Incheon (ICN) → Tokyo (NRT)",
    date: "Departure",
    dateValue: "Your booked date",
    ref: "Booking ref.",
    pax: "Passengers",
    paxValue: "KIM · 1 fictional passenger",
    linkTitle: "Do you need any help at the airport?",
    linkBody: "Tell us once and you will not have to explain it again. It takes a minute or two.",
    linkButton: "Tell us the help you need",
    smsTitle: "If a link cannot be placed here: booking text message",
    sms: "[Booking confirmed] Your flight is booked.\nIf you need any help at the airport, let us know in advance.\n→ Journey Support Pass link",
    other: "Also: booking e-mail, the airline's booking page, the airport website",
    back: "Home",
  },
};

export default async function BookingDemo({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = langOf((await searchParams).lang);
  const t = TEXT[lang];
  const q = lang === "en" ? "&lang=en" : "";
  return (
    <PublicShell lang={lang}>
      <main id="public-main" className="task-home">
        <div className="dm-home">
          <section className="ph-hero dm-hero" aria-labelledby="booking-done">
            <div className="ph-hero-copy">
              <span className="ph-hero-label" role="note">
                <Info aria-hidden="true" />
                {t.notice}
              </span>
              <h1 id="booking-done" className="dm-done">
                <CircleCheck aria-hidden="true" />
                {t.done}
              </h1>
              <Link className="ph-text-link" href={lang === "en" ? "/?lang=en" : "/"}>
                <ArrowLeft aria-hidden="true" />
                {t.back}
              </Link>
            </div>
            <dl className="dm-trip" aria-label={t.itinerary}>
              <dt>{t.itinerary}</dt>
              <dd>{t.route}</dd>
              <dt>{t.date}</dt>
              <dd>{addDays(kstDate(new Date()), 1)} 18:00 (KST)</dd>
              <dt>{t.ref}</dt>
              <dd className="num">DEMO01</dd>
              <dt>{t.pax}</dt>
              <dd>{t.paxValue}</dd>
            </dl>
          </section>
          <div className="dm-cards">
            <section className="dm-card" aria-labelledby="booking-link">
              <HeartHandshake aria-hidden="true" className="dm-card-icon" strokeWidth={1.7} />
              <div>
                <h2 id="booking-link">{t.linkTitle}</h2>
                <p>{t.linkBody}</p>
              </div>
              <Link className="btn btn-primary dm-card-go" href={`/prepare/booking?via=booking${q}`}>
                {t.linkButton}
                <ArrowRight aria-hidden="true" />
              </Link>
            </section>
            <section className="dm-card" aria-labelledby="booking-sms">
              <MessageSquareText aria-hidden="true" className="dm-card-icon" strokeWidth={1.7} />
              <div>
                <h2 id="booking-sms">{t.smsTitle}</h2>
                <p className="dm-sms">{t.sms}</p>
              </div>
              <p className="dm-card-note">{t.other}</p>
            </section>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
