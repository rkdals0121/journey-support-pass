import { PublicShell } from "../components/PublicShell";
import { SavedVisits } from "../visits/SavedVisits";
import { MyRequests } from "./MyRequests";
import { currentSession } from "@/lib/session-server";
import { placeOf } from "@/lib/airport";
import { redirect } from "next/navigation";
export default async function Requests({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const en = (await searchParams).lang === "en";
  const session = await currentSession();
  if (session?.isKiosk)
    redirect(
      placeOf(session.placeId)?.landside ? "/kiosk/entry" : "/kiosk/guide",
    );
  return (
    <PublicShell lang={en ? "en" : "ko"}>
      <div className="wrap">
        <SavedVisits en={en} />
      </div>
      <MyRequests en={en} />
    </PublicShell>
  );
}
