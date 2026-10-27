import { PublicShell } from "./components/PublicShell";
import { TaskHome } from "./components/TaskHome";
import { PortalSupport } from "./components/PortalSupport";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const lang = (await searchParams).lang === "en" ? "en" : "ko";
  return (
    <PublicShell lang={lang}>
      <main id="public-main" className="task-home">
        <TaskHome en={lang === "en"} />
        <PortalSupport lang={lang} showRequests={false} showPrepare={false} />
      </main>
    </PublicShell>
  );
}
