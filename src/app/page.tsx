import { PublicShell } from "./components/PublicShell";
import { TaskHome } from "./components/TaskHome";
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
      </main>
    </PublicShell>
  );
}
