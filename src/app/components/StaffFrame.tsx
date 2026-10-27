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
  Plug,
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
  const groups = [
    {
      title: "현장 업무",
      items: [
        { href: "/staff/requests", label: "접수·배정", Icon: Inbox },
        { href: "/staff/resources", label: "장비 현황·배차", Icon: CarFront },
        ...(isDesk
          ? [
              {
                href: "/staff/desk",
                label: "안내데스크",
                Icon: ClipboardCheck,
              },
              {
                href: "/staff/overview",
                label: "통합 운영 현황",
                Icon: ChartColumn,
              },
            ]
          : []),
      ],
    },
    {
      title: "운영 관리",
      items: [
        ...(isDesk
          ? [
              { href: "/staff/alerts", label: "알림 운영", Icon: Bell },
              { href: "/staff/integrations", label: "외부 연동", Icon: Plug },
            ]
          : []),
        { href: "/staff/operations", label: "운영 기준", Icon: Settings2 },
      ],
    },
    {
      title: "기타 업무",
      items: [
        {
          href: "/staff/legacy",
          label: "이전 요청·인계",
          Icon: ArrowLeftRight,
        },
        ...(isDesk
          ? [{ href: "/staff/demo", label: "시연 준비", Icon: PlayCircle }]
          : []),
      ],
    },
  ];
  const menu = groups.map((group) => (
    <div className="workspace-nav-group" key={group.title}>
      <p>{group.title}</p>
      {group.items.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={
            path === href || path.startsWith(href + "/") ? "page" : undefined
          }
          onClick={(e) =>
            e.currentTarget.closest("details")?.removeAttribute("open")
          }
        >
          <Icon size={19} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </div>
  ));
  const current = groups
    .flatMap((g) => g.items)
    .find((i) => path === i.href || path.startsWith(i.href + "/"));
  return (
    <div className="staff-workspace airport-workspace">
      <a href="#staff-content" className="public-skip">
        본문 바로가기
      </a>
      <header className="workspace-header">
        <span className="workspace-context">
          직원 업무 <span aria-hidden="true">/</span>{" "}
          <strong>{current?.label ?? "업무 공간"}</strong>
        </span>
        <Link className="public-logo" href="/staff/requests">
          <Sunflower />
          <span>
            공항 이용 지원<small>직원 통합 운영</small>
          </span>
        </Link>
        <Link href="/">
          여객 화면
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
        <details className="workspace-mobile-menu">
          <summary>업무 메뉴</summary>
          <nav aria-label="모바일 업무 메뉴">{menu}</nav>
        </details>
      </header>
      <div className="workspace-grid">
        <aside className="workspace-side">
          <Link className="workspace-brand" href="/staff/requests">
            <Sunflower />
            <span>
              공항 이용 지원<small>직원 통합 운영</small>
            </span>
          </Link>
          <nav aria-label="업무 메뉴">{menu}</nav>
        </aside>
        <div id="staff-content" className="workspace-content">
          {children}
        </div>
      </div>
    </div>
  );
}
