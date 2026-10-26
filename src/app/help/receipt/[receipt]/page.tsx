import { notFound } from "next/navigation";
import { HelpFlow } from "../../HelpFlow";
import { PublicShell } from "@/app/components/PublicShell";
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ receipt: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { receipt } = await params;
  if (!/^[a-f0-9]{64}$/.test(receipt)) notFound();
  const lang = (await searchParams).lang === "en" ? "en" : "ko";
  // Possession of this unguessable link grants access only to this request, not to pre-registration.
  return (
    <PublicShell lang={lang}>
      <div className="request-receipt-shell">
        <HelpFlow
          embedded
          lang={lang}
          initialReceipt={/^[a-f0-9]{64}$/.test(receipt) ? receipt : undefined}
        />
      </div>
    </PublicShell>
  );
}
