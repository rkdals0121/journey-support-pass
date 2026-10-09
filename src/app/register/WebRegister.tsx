"use client";

import { useEffect } from "react";
import { RegisterFlow } from "../components/RegisterFlow";
import { resetViewSettings } from "../components/viewSettings";
import type { Lang } from "@/lib/i18n";

/** 여객이 자기 휴대전화로 하는 등록. 마치면 패스 화면으로 간다. 그 주소가 곧 패스다. */
export function WebRegister({ lang }: { lang: Lang }) {
  // 등록을 새로 시작하면 앞서 「설정」에서 바꿔 둔 글자 크기는 지운다. 이번 등록에서 바꾼 것만 패스 화면으로 이어진다.
  useEffect(() => resetViewSettings(), []);
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
