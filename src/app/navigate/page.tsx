import { PublicShell } from "../components/PublicShell";
import { NavigationFlow } from "./NavigationFlow";
export default async function Navigate({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en";
  return (
    <PublicShell lang={en ? "en" : "ko"}>
      <NavigationFlow en={en} />
    </PublicShell>
  );
}
