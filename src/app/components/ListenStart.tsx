"use client";

import { Volume2, VolumeX } from "lucide-react";
import type { Text } from "@/lib/i18n";
import { setViewSettings, useViewSettings } from "./viewSettings";

/**
 * 키오스크 처음 화면의 큰 「소리로 안내 듣기」 버튼.
 * 앞이 잘 보이지 않는 여객은 QR 을 대기 전에는 소리 안내를 켤 방법이 위쪽 줄의 작은 스피커 그림뿐이었다.
 * 누르면 이 화면부터 읽어 주고, QR 을 대거나 등록을 시작한 뒤에도 계속 읽어 준다. 다음 사람으로 넘어가면 꺼진다.
 */
export function ListenStart({ t }: { t: Text }) {
  const on = useViewSettings().voice === true;
  return (
    <button className={`btn listen-start ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setViewSettings({ voice: !on })}>
      {on ? <VolumeX size={24} aria-hidden="true" /> : <Volume2 size={24} aria-hidden="true" />}
      {on ? t.listenStartOff : t.listenStart}
    </button>
  );
}
