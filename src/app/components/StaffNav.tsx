"use client";

import { BadgeCheck, BarChart3, BellRing, ConciergeBell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 직원 화면 어디서든 바로 갈 수 있게 아래에 고정한다.
// 안내데스크와 오늘 현황은 안내데스크 권한으로 로그인했을 때만 보인다.
export function StaffNav({ isDesk }: { isDesk: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/staff", label: "호출", Icon: BellRing, on: path === "/staff" },
    // 우대출구 확인은 시제품에서 로그인한 직원 누구나 쓴다.
    { href: "/staff/exit", label: "우대출구", Icon: BadgeCheck, on: path === "/staff/exit" },
    ...(isDesk
      ? [
          { href: "/staff/desk", label: "안내데스크", Icon: ConciergeBell, on: path === "/staff/desk" },
          { href: "/staff/desk/stats", label: "오늘 현황", Icon: BarChart3, on: path.startsWith("/staff/desk/stats") },
        ]
      : []),
  ];
  return (
    <nav className="staff-nav" aria-label="직원 메뉴">
      {items.map(({ href, label, Icon, on }) => (
        <Link key={href} href={href} aria-current={on ? "page" : undefined}>
          <span className="nav-ico">
            <Icon size={22} aria-hidden="true" />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
