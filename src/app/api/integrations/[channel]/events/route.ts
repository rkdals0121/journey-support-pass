import { getDb } from "@/lib/db";
import { json } from "@/lib/session-server";
import {
  INTEGRATION_CHANNELS,
  type IntegrationChannel,
} from "@/lib/integration-model";
import { integrationCallback } from "@/lib/external-integrations";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel } = await params;
  if (!INTEGRATION_CHANNELS.includes(channel as IntegrationChannel))
    return Response.json({ error: "unknown_channel" }, { status: 404 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "empty_body" }, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      return Response.json({ error: "body_too_large" }, { status: 413 });
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return json(
    await integrationCallback(
      await getDb(),
      channel as IntegrationChannel,
      raw,
      request.headers.get("x-integration-timestamp") ?? "",
      request.headers.get("x-integration-signature") ?? "",
      new Date(),
    ),
  );
}
