import type { Metadata } from "next";

// 직원 로그인 화면은 클라이언트 화면이라 제목을 여기서 붙인다.
export const metadata: Metadata = { title: "직원 로그인 · Journey Support Pass" };

export default function StaffLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
