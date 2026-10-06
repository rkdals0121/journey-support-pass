"use client";

import { ConciergeBell, ScanLine, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 직원 화면 어디서든 세 곳으로 바로 갈 수 있게 아래에 고정한다.
// 안내데스크는 그 권한으로 로그인했을 때만 보인다.
export function StaffNav({ isDesk }: { isDesk: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/staff", label: "여객 목록", Icon: Users, on: path === "/staff" || path.startsWith("/staff/case") },
    { href: "/staff/scan", label: "패스 스캔", Icon: ScanLine, on: path.startsWith("/staff/scan") },
    ...(isDesk
      ? [{ href: "/staff/desk", label: "안내데스크", Icon: ConciergeBell, on: path.startsWith("/staff/desk") }]
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
