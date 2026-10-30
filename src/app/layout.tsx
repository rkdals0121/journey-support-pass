import { designColor } from "@/lib/design-theme";
import type { Metadata, Viewport } from "next";
import { Barlow_Condensed } from "next/font/google";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/passenger.css";
import "./styles/devices.css";
import "./styles/staff.css";
import "./styles/passenger-layout.css";
import "./styles/staff-layout.css";
import "./styles/kiosk-layout.css";
import "./styles/haneuli.css";
import "./styles/sunflower.css";
import "./styles/site-bar.css";
import "./styles/responsive-passenger.css";

// 본문은 Pretendard, 숫자(탑승구·시각·편명·번호)는 공항 표지판처럼 굵고 좁은 Barlow Condensed.
const num = Barlow_Condensed({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-num-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Journey Support Pass",
  description: "공항 길 찾기, 현장 도움 요청과 처리 현황 확인",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: designColor("primary") };

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // 패스 화면은 큰 글씨와 언어를 화면을 그리기 전에 html 에 적용한다. 그 차이를 React 가 오류로 보지 않게 한다(suppressHydrationWarning).
  return (
    <html lang="ko" className={num.variable} suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  );
}
