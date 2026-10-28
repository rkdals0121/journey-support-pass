export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
import { notFound } from "next/navigation";
import { PublicShell } from "@/app/components/PublicShell";
import { VisitStatus } from "../VisitStatus";
export default async function VisitPage({ params, searchParams }: { params: Promise<{ receipt: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { receipt } = await params, en = (await searchParams).lang === "en";
  if (!/^[a-f0-9]{64}$/.test(receipt)) notFound();
  return <PublicShell lang={en ? "en" : "ko"}><VisitStatus key={receipt} receipt={receipt} en={en} /></PublicShell>;
}
