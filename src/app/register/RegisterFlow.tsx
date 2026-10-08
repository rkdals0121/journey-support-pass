"use client";

import { useRouter } from "next/navigation";
import { RegistrationSteps, type FlightOption, type RegistrationPayload } from "../components/RegistrationSteps";
import { TEXT, type Lang } from "@/lib/i18n";

export const RECEIPT_KEY = "jsp:receipt";

/** 등록 완료 화면에 보여줄 것. 이 탭에만 두고, 탭을 닫으면 사라진다. */
export interface ReceiptInfo {
  /** 패스 번호 네 자리. 카메라를 못 쓸 때 직원이 이 번호를 넣는다. */
  passNo: string;
  /** 패스 QR 에 들어가는 값. 이 탭에만 둔다. */
  token: string;
  name: string;
  flightNo: string;
  destName: string;
  when: string;
  lang: Lang;
}

export function RegisterFlow({ mock, lang }: { mock: boolean; lang: Lang }) {
  const router = useRouter();
  const t = TEXT[lang];

  async function submit(payload: RegistrationPayload, flight: FlightOption): Promise<string | null> {
    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      // 서버의 오류 문구는 한국어다. 영어 화면에서는 한 가지 안내로 바꿔 보여준다.
      if (!res.ok) return lang === "en" ? t.failed : (data.error ?? t.failed);
      // 패스 번호와 QR 값은 주소에 넣지 않는다. 이 탭에만 둔다.
      const day = flight.day === "오늘" ? t.today : flight.day === "내일" ? t.tomorrow : flight.day;
      const info: ReceiptInfo = {
        passNo: data.passNo,
        token: data.token,
        name: payload.name,
        flightNo: flight.flightNo,
        destName: lang === "en" && flight.destCode ? flight.destCode : flight.destName,
        when: `${day} ${flight.time}`,
        lang,
      };
      sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(info));
      router.push("/register/done");
      return null;
    } catch {
      return t.offline;
    }
  }

  return (
    <RegistrationSteps
      mock={mock}
      lang={lang}
      onExit={() => router.push(lang === "en" ? "/?lang=en" : "/")}
      onSubmit={submit}
    />
  );
}
