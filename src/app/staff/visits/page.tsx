import { requireStaff } from "@/lib/staff-page";
import { VisitConsole } from "./VisitConsole";
import styles from "@/app/components/support-journey.module.css";
export const dynamic = "force-dynamic";
export default async function VisitOperations() { const s = await requireStaff(); return <main className={styles.page}><p className={styles.eyebrow}>현장 업무</p><h1>거점 예약·현장 응대</h1><p className={styles.demo}>시연 운영 단위 · 근무·장비 상태는 직원 입력 기준</p><VisitConsole isDesk={s.isDesk} /></main>; }
