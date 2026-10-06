import { config } from "@/lib/config";
import { langOf } from "@/lib/i18n";
import { RegisterFlow } from "./RegisterFlow";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = langOf((await searchParams).lang);
  return (
    <main className="page has-cta" lang={lang}>
      <RegisterFlow mock={config.dataMode === "mock"} lang={lang} />
    </main>
  );
}
