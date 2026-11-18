import { requireStaff } from "@/lib/staff-page";
import { redirect } from "next/navigation";
import { ExperienceDashboard } from "./ExperienceDashboard";
import { StaffNav } from "@/app/components/StaffNav";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("운영 효과·체험 집계");
export const dynamic = "force-dynamic";
export default async function ExperiencePage() { const s = await requireStaff(); if (!s.isDesk) redirect("/staff/visits"); return (
    <>
      <main className="page has-nav staff-experience">
        <header className="workspace-page-head">
          <div>
            <p className="eyebrow">운영 관리 · 시범 운영 분석</p>
            <h1>운영 효과·체험 집계</h1>
            <p className="muted">최근 30일 · 시연 데이터와 실제 운영 검증 결과를 구분해 해석하세요.</p>
          </div>
        </header>
        <ExperienceDashboard />
      </main>
      <StaffNav isDesk />
    </>
  );
}
