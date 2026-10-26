import type { Metadata, Viewport } from "next";
import { Barlow_Condensed } from "next/font/google";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { MockBanner } from "./components/MockBanner";
import "./globals.css";
import "./redesign.css";

// 본문은 Pretendard, 숫자(탑승구·시각·편명·번호)는 공항 표지판처럼 굵고 좁은 Barlow Condensed.
const num = Barlow_Condensed({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-num-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Journey Support Pass",
  description: "인천공항 교통약자 지원 등록",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f231b" };

// 띠 표시 여부가 실행 시점의 DATA_MODE 를 따르도록 한다.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // 패스 화면은 큰 글씨와 언어를 화면을 그리기 전에 html 에 적용한다. 그 차이를 React 가 오류로 보지 않게 한다(suppressHydrationWarning).
  return (
    <html lang="ko" className={num.variable} suppressHydrationWarning>
      <body>
        <MockBanner />
        {children}
      </body>
    </html>
  );
}
