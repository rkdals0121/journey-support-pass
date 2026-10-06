import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Sans_KR } from "next/font/google";
import { MockBanner } from "./components/MockBanner";
import "./globals.css";

// 본문은 IBM Plex Sans KR, 숫자(탑승구·시각·편명·번호)는 공항 표지판처럼 굵고 좁은 Barlow Condensed.
const body = IBM_Plex_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-body-loaded",
  display: "swap",
  preload: false,
});
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

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#10241c" };

// 띠 표시 여부가 실행 시점의 DATA_MODE 를 따르도록 한다.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${body.variable} ${num.variable}`}>
      <body>
        <MockBanner />
        {children}
      </body>
    </html>
  );
}
