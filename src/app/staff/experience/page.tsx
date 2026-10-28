import { requireStaff } from "@/lib/staff-page";
import { redirect } from "next/navigation";
import { ExperienceDashboard } from "./ExperienceDashboard";
import styles from "@/app/components/support-journey.module.css";
export const dynamic = "force-dynamic";
export default async function ExperiencePage() { const s = await requireStaff(); if (!s.isDesk) redirect("/staff/visits"); return <main className={styles.page}><p className={styles.eyebrow}>시범 운영 분석</p><h1>운영 효과·체험 집계</h1><ExperienceDashboard /></main>; }
