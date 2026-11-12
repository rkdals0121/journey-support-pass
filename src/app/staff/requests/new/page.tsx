import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff-page";
import { HelpFlow } from "../../../help/HelpFlow";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("여객 대신 접수");
export const dynamic = "force-dynamic";
export default async function AssistedRequest() {
  const s = await requireStaff();
  if (!s.isDesk) redirect("/staff/requests");
  return <HelpFlow lang="ko" sharedDevice assisted />;
}
