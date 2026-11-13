"use client";
import { useEffect, useState } from "react";

/**
 * 기기 화면 미리보기(주소에 ?preview=1) 안인지. 링크와 「이전」에 preview=1 을 이어 붙이는 데 쓴다.
 * 정적으로 그려지는 화면에서도 쓸 수 있게 useSearchParams 대신 그린 뒤 주소를 읽는다.
 */
export function usePreview() {
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    setPreview(new URLSearchParams(window.location.search).get("preview") === "1");
  }, []);
  return preview;
}
