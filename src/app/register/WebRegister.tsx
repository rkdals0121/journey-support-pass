"use client";

import { RegisterFlow } from "../components/RegisterFlow";
import type { Lang } from "@/lib/i18n";

/** 여객이 자기 휴대전화로 하는 등록. 마치면 패스 화면으로 간다. 그 주소가 곧 패스다. */
export function WebRegister({ lang }: { lang: Lang }) {
  return (
    <RegisterFlow
      mode="web"
      initialLang={lang}
      onExit={() => window.location.assign(lang === "en" ? "/?lang=en" : "/")}
      // 뒤로 가기로 등록 화면에 되돌아오지 않게 주소를 바꿔치기한다.
      onDone={(r) => window.location.replace(`/p/${r.token}?new=1`)}
    />
  );
}
