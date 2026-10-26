"use client";

import { useEffect } from "react";
import { RegisterFlow } from "../components/RegisterFlow";
import { setViewSettings } from "../components/viewSettings";
import type { Lang } from "@/lib/i18n";

/** 여객이 자기 휴대전화로 하는 등록. 마치면 패스 화면으로 간다. 그 주소가 곧 패스다. */
export function WebRegister({
  lang,
  via = "",
}: {
  lang: Lang;
  via?: "booking" | "";
}) {
  // Keep the portal's text size while resetting the previous registration's audio/picture overrides.
  useEffect(() => setViewSettings({voice:null,picture:null}), []);
  return (
    <RegisterFlow
      mode="web"
      initialLang={lang}
      via={via}
      // 주소에 있던 언어가 아니라 등록 중에 고른 언어로 처음 화면에 돌아간다. 한국어로 시작해 English 를 고른 여객이 한국어 화면을 보지 않게 한다.
      onExit={(l) => {
        const q = new URLSearchParams({
          ...(via ? { via } : {}),
          ...(l === "en" ? { lang: "en" } : {}),
        });
        window.location.assign("/prepare" + (q.size ? "?" + q.toString() : ""));
      }}
      // 뒤로 가기로 등록 화면에 되돌아오지 않게 주소를 바꿔치기한다.
      onDone={(r) => window.location.replace(`/p/${r.token}?new=1`)}
    />
  );
}
