import { langOf } from "@/lib/i18n";
import { WebRegister } from "./WebRegister";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  return <WebRegister lang={langOf((await searchParams).lang)} />;
}
