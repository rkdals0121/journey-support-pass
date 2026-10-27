import { PublicShell } from "./components/PublicShell";
import { ServiceDirectory } from "./components/ServiceDirectory";
import { PortalSupport } from "./components/PortalSupport";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const lang = (await searchParams).lang === "en" ? "en" : "ko";
  return (
    <PublicShell lang={lang}>
      <main id="public-main" className="airport-portal">
        <ServiceDirectory lang={lang} portal />
        <PortalSupport lang={lang} />
      </main>
    </PublicShell>
  );
}
