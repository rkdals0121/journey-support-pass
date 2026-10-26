"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  ClipboardCheck,
  ArrowLeftRight,
  CarFront,
  Bell,
  ChartColumn,
  Settings2,
  ArrowUpRight,
  PlayCircle,
} from "lucide-react";
import { Sunflower } from "./Sunflower";
export function StaffFrame({
  isDesk,
  children,
}: {
  isDesk: boolean;
  children: React.ReactNode;
}) {
  const path = usePathname();
  if (path === "/staff/login" || path === "/staff/zone") return children;
  const items = [
    { href: "/staff/requests", label: "접수·배정", Icon: Inbox },
    { href: "/staff/resources", label: "장비 현황·배차", Icon: CarFront },
    ...(isDesk
      ? [
          { href: "/staff/alerts", label: "알림 운영", Icon: Bell },
          { href: "/staff/desk", label: "안내데스크", Icon: ClipboardCheck },
          {
            href: "/staff/overview",
            label: "통합 운영 현황",
            Icon: ChartColumn,
          },
          { href: "/staff/demo", label: "시연 준비", Icon: PlayCircle },
        ]
      : []),
    { href: "/staff/legacy", label: "이전 요청·인계", Icon: ArrowLeftRight },
    { href: "/staff/operations", label: "운영 기준", Icon: Settings2 },
  ];
  return (
    <div className="staff-workspace">
      <a href="#staff-content" className="public-skip">
        본문 바로가기
      </a>
      <header className="workspace-header">
        <Link className="public-logo" href="/staff/requests">
          <Sunflower />
          <span>
            분(分)실<small>직원 통합 운영</small>
          </span>
        </Link>
        <Link href="/">
          여객 화면
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>
      <div className="workspace-grid">
        <aside className="workspace-side">
          <p>업무 공간</p>
          <nav aria-label="업무 메뉴">
            {items.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={
                  path === href ||
                  (href === "/staff/requests" &&
                    path.startsWith("/staff/requests/"))
                    ? "page"
                    : undefined
                }
              >
                <Icon size={19} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="workspace-side-note">
            접수부터 현장 지원까지
            <br />
            같은 요청으로 연결합니다.
          </div>
        </aside>
        <div id="staff-content" className="workspace-content">
          {children}
        </div>
      </div>
    </div>
  );
}
