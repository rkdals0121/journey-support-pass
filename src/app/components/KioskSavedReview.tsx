import Image from "next/image";
import type { Lang, Text } from "@/lib/i18n";
import type { Extra } from "@/lib/catalog";
import type { FlightView } from "@/lib/guide";
import { FlightBoard } from "./GuideParts";
import { KioskNeeds } from "./KioskNeeds";

/**
 * 키오스크 「미리 등록하신 내용이에요」 화면(안내 키오스크·입구 키오스크 공용).
 * 왼쪽(세로 화면은 위)에 나랑이가 말하는 제목(말풍선)과 큰 나랑이, 오른쪽에 항공편·등록한 도움.
 * 칸은 내용 크기만큼만 차지하고, 남는 자리는 나랑이와 큰 글자가 쓴다(빈 칸이 늘어나던 것을 바꿈).
 */
export function KioskSavedReview({ title, lead, flight, choices, extra, lang, t }: {
  title: string; lead?: string; flight: FlightView; choices: string[]; extra: Extra; lang: Lang; t: Text;
}) {
  return (
    <div className="kc-page kc-saved">
      <KioskNarangiSide title={title} lead={lead} />
      <div className="kc-saved-main">
        <FlightBoard flight={flight} t={t} lang={lang} />
        <KioskNeeds choices={choices} extra={extra} lang={lang} t={t} />
      </div>
    </div>
  );
}

/**
 * 키오스크 화면 왼쪽(세로 화면은 위)의 말풍선(제목)과 큰 나랑이. 「미리 등록하신 내용이에요」·「나에게 맞춘 안내」가 함께 쓴다.
 * 남는 높이는 나랑이가 채운다(.kc-saved 틀 안에서).
 */
export function KioskNarangiSide({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="kc-saved-side">
      <div className="kc-saved-bubble">
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      <div className="kc-saved-art" aria-hidden="true">
        <Image src="/images/haneuli/narangi.webp" alt="" width={1024} height={1024} sizes="(orientation: portrait) 30vh, 40vw" priority />
      </div>
    </div>
  );
}
