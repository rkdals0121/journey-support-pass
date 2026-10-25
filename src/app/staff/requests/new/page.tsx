import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff-page";
import { HelpFlow } from "../../../help/HelpFlow";
export const dynamic = "force-dynamic";
export default async function AssistedRequest() {
  const s = await requireStaff();
  if (!s.isDesk) redirect("/staff/requests");
  return <HelpFlow lang="ko" sharedDevice assisted />;
}
