import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// 직원의 첫 화면. 여객이 키오스크에서 누른 「직원 부르기」가 여기에 뜬다.
export default async function StaffPage() {
  redirect("/staff/requests");
}
