import { requireStaff } from "@/lib/staff-page";
import { redirect } from "next/navigation";
import { ExperienceDashboard } from "./ExperienceDashboard";
import { StaffNav } from "@/app/components/StaffNav";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("운영 집계");
export const dynamic = "force-dynamic";
export default async function ExperiencePage() { const s = await requireStaff(); if (!s.isDesk) redirect("/staff/visits"); return (
    <>
      <main className="page has-nav staff-experience">
        <header className="workspace-page-head">
          <div>
            <h1>운영 집계</h1>
          </div>
        </header>
        <ExperienceDashboard />
      </main>
      <StaffNav isDesk />
    </>
  );
}
