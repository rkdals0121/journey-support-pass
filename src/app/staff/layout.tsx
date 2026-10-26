import { currentSession } from "@/lib/session-server";
import { StaffFrame } from "../components/StaffFrame";
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await currentSession();
  return s && !s.isKiosk && !s.needsZone ? (
    <StaffFrame isDesk={s.isDesk}>{children}</StaffFrame>
  ) : (
    children
  );
}
