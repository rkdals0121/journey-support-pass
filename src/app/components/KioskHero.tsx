import Image from "next/image";
import type { ReactNode } from "react";

/** 첫 화면의 소개 박스를 재사용하는 키오스크용 한 줄 제목. */
export function KioskHero({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  return <section className="ph-hero kc-hero">
    <div className="ph-hero-copy"><h1>{title}</h1>{lead && <p>{lead}</p>}{children}</div>
    <div className="ph-hero-art" aria-hidden="true"><span className="ph-hero-orbit" /><Image src="/images/haneuli/narangi.webp" alt="" width={1280} height={1280} sizes="20vh" /></div>
  </section>;
}
