import { notFound } from "next/navigation";
import { HelpFlow } from "../../HelpFlow";
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ receipt: string }>;
}) {
  const { receipt } = await params;
  if (!/^[a-f0-9]{64}$/.test(receipt)) notFound();
  // Possession of this unguessable link grants access only to this request, not to pre-registration.
  return (
    <HelpFlow
      lang="ko"
      initialReceipt={/^[a-f0-9]{64}$/.test(receipt) ? receipt : undefined}
    />
  );
}
