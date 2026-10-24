import { langOf } from "@/lib/i18n";
import { WebRegister } from "./WebRegister";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ lang?: string; via?: string }> }) {
  const q = await searchParams;
  // via=booking: 항공권 예매 완료 창의 링크로 들어왔다. 여객 정보는 주소에 싣지 않는다(공항은 예약 정보를 받지 않는다).
  return <WebRegister lang={langOf(q.lang)} via={q.via === "booking" ? "booking" : ""} />;
}
