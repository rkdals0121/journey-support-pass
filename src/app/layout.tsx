import type { Metadata, Viewport } from "next";
import { MockBanner } from "./components/MockBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Journey Support Pass",
  description: "인천공항 교통약자 지원 등록",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// 띠 표시 여부가 실행 시점의 DATA_MODE 를 따르도록 한다.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <MockBanner />
        {children}
      </body>
    </html>
  );
}
