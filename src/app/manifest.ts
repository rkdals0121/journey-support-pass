import type { MetadataRoute } from "next";

// 휴대전화 홈 화면에 추가하면 앱처럼 열린다. 직원은 직원 화면을, 여객은 첫 화면을 추가해 쓴다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Journey Support Pass",
    short_name: "지원 패스",
    description: "인천공항 교통약자 지원 등록",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f3",
    theme_color: "#0f231b",
    lang: "ko",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
