"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 직원 화면 어디서든 세 곳으로 바로 갈 수 있게 아래에 고정한다.
// 안내데스크는 그 권한으로 로그인했을 때만 보인다.
export function StaffNav({ isDesk }: { isDesk: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/staff", label: "여객 목록", on: path === "/staff" },
    { href: "/staff/scan", label: "패스 스캔", on: path.startsWith("/staff/scan") },
    ...(isDesk ? [{ href: "/staff/desk", label: "안내데스크", on: path.startsWith("/staff/desk") }] : []),
  ];
  return (
    <nav className="staff-nav" aria-label="직원 메뉴">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.on ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
