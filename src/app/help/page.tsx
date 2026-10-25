import { currentSession } from "@/lib/session-server";
import { HelpFlow } from "./HelpFlow";
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; place?: string }>;
}) {
  const q = await searchParams;
  const session = await currentSession();
  return (
    <HelpFlow
      lang={q.lang === "en" ? "en" : "ko"}
      initialPlace={
        session?.isKiosk ? (session.placeId ?? "") : (q.place ?? "")
      }
      sharedDevice={session?.isKiosk === true}
      lockedPlace={session?.isKiosk === true}
    />
  );
}
