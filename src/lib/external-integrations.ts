import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "./db";
import type { Session } from "./auth";
import { fail, ok } from "./api/dto";
import { isUuid } from "./registrations";
import { bridgeConfig, integrationReadiness } from "./integration-config";
import {
  INTEGRATION_CHANNELS,
  type IntegrationChannel,
  type IntegrationJobView,
} from "./integration-model";
interface JobRow {
  id: string;
  request_id: string;
  channel: IntegrationChannel;
  state: string;
  external_id: string | null;
  attempts: number;
  last_error: string;
  updated_at: Date;
  version: number;
  resource_id: string | null;
  request_version: number;
}
const jobView = (r: JobRow): IntegrationJobView => ({
  id: r.id,
  requestId: r.request_id,
  channel: r.channel,
  state: r.state,
  externalId: r.external_id,
  attempts: r.attempts,
  lastError: r.last_error,
  updatedAt: r.updated_at.toISOString(),
  version: r.version,
});
function denied(s: Session | null) {
  return !s || s.isKiosk
    ? fail(401, "직원 로그인이 필요합니다")
    : s.needsZone
      ? fail(409, "근무 구역을 먼저 선택해 주세요")
      : !s.isDesk
        ? fail(403, "연동 시험은 안내데스크에서 관리합니다")
        : null;
}
export async function integrationOverview(db: Db, s: Session | null) {
  const auth = denied(s);
  if (auth) return auth;
  const jobs = await db.query<JobRow>(
    `select j.* from integration_jobs j join service_requests r on r.id=j.request_id where r.expires_at>now() order by j.updated_at desc limit 50`,
  );
  return ok({
    channels: integrationReadiness(),
    jobs: jobs.map(jobView),
    mode: "preparation",
  });
}
export async function enqueueIntegration(
  db: Db,
  s: Session | null,
  body: Record<string, unknown>,
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
) {
  const auth = denied(s);
  if (auth) return auth;
  const channel = body.channel as IntegrationChannel;
  if (
    !INTEGRATION_CHANNELS.includes(channel) ||
    !isUuid(body.requestId) ||
    !Number.isInteger(body.version)
  )
    return fail(400, "요청·연동 유형을 확인해 주세요");
  const config = bridgeConfig(channel, env);
  if ("state" in config) return fail(503, config.message);
  const [r] = await db.query<{
    id: string;
    version: number;
    resource_id: string | null;
    service: string;
    state: string;
  }>(
    `select id,version,resource_id,service,state from service_requests where id=$1 and expires_at>$2`,
    [body.requestId, now],
  );
  if (!r) return fail(404, "요청이 만료되었거나 없습니다");
  if (r.version !== body.version)
    return fail(409, "요청 상태가 바뀌었습니다. 다시 확인해 주세요");
  if (
    !["received", "assigned", "en_route", "arrived", "serving"].includes(
      r.state,
    )
  )
    return fail(409, "진행 중인 요청만 시험 전송할 수 있습니다");
  if (
    channel !== "agency" &&
    (channel !== r.service ||
      !r.resource_id ||
      r.state !== "assigned" ||
      !config.resources[r.resource_id])
  )
    return fail(409, "담당·장비 배차 및 제조사 시험 장비 ID 매핑이 필요합니다");
  const rows = await db.query<JobRow>(
    `insert into integration_jobs(request_id,channel,resource_id,created_by_zone,created_at,updated_at,next_attempt_at,request_version) values($1,$2,$3,$4,$5,$5,$5,$6) on conflict(request_id,channel) do nothing returning *`,
    [r.id, channel, r.resource_id, s!.zoneId, now, r.version],
  );
  const job =
    rows[0] ??
    (
      await db.query<JobRow>(
        "select * from integration_jobs where request_id=$1 and channel=$2",
        [r.id, channel],
      )
    )[0];
  return ok({ job: jobView(job), mode: "sandbox" });
}
/** Durable idempotency key is the job UUID. Reclaiming a timed-out lease never changes it. */
export async function processIntegrationJobs(
  db: Db,
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const enabled = INTEGRATION_CHANNELS.filter(
    (c) => !("state" in bridgeConfig(c, env)),
  );
  if (!enabled.length) return { processed: 0, mode: "disabled" };
  await db.query(
    `update integration_jobs j set state='stopped',external_id=null,last_error='',lease_until=null,version=j.version+1,updated_at=$1 from service_requests r where j.request_id=r.id and r.expires_at<=$1 and (j.state<>'stopped' or j.external_id is not null or j.last_error<>'')`,
    [now],
  );
  await db.query(
    `update integration_jobs set state='failed',last_error='retry_exhausted',lease_until=null,updated_at=$1,version=version+1 where state='sending' and lease_until<=$1 and attempts>=5`,
    [now],
  );
  const jobs = await db.query<JobRow>(
    `with picked as (select id from integration_jobs where channel=any($2::text[]) and attempts<5 and ((state='pending' and next_attempt_at<=$1) or (state='sending' and lease_until<=$1)) order by created_at for update skip locked limit 5) update integration_jobs j set state='sending',attempts=attempts+1,lease_until=$1::timestamptz+interval '30 seconds',updated_at=$1,version=version+1 from picked where j.id=picked.id returning j.*`,
    [now, enabled],
  );
  for (const job of jobs) {
    const cfg = bridgeConfig(job.channel, env);
    if ("state" in cfg) continue;
    const [r] = await db.query<{
      id: string;
      service: string;
      state: string;
      place_id: string;
      destination_id: string | null;
      party: number;
      lang: string;
      topic_id: string | null;
      business_id: string | null;
      service_details: unknown;
      created_at: Date;
      resource_id: string | null;
      version: number;
    }>(
      `select id,service,state,place_id,destination_id,party,lang,topic_id,business_id,service_details,created_at,resource_id,version from service_requests where id=$1 and expires_at>$2`,
      [job.request_id, now],
    );
    if (
      !r ||
      r.version !== job.request_version ||
      !["received", "assigned", "en_route", "arrived", "serving"].includes(
        r.state,
      ) ||
      (job.channel !== "agency" &&
        (r.state !== "assigned" ||
          r.resource_id !== job.resource_id ||
          !cfg.resources[r.resource_id ?? ""]))
    ) {
      await db.query(
        `update integration_jobs set state='stopped',lease_until=null,last_error='요청 종료·만료 또는 장비 배차 변경',updated_at=$2,version=version+1 where id=$1 and state='sending' and version=$3`,
        [job.id, now, job.version],
      );
      continue;
    }
    let transient = false,
      code = "";
    try {
      const response = await fetcher(cfg.url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + cfg.token,
          "Content-Type": "application/json",
          "Idempotency-Key": job.id,
        },
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          contract: "jsp-gateway-v1",
          mode: "sandbox",
          jobId: job.id,
          channel: job.channel,
          request: {
            id: r.id,
            service: r.service,
            topic: r.topic_id,
            business: r.business_id,
            placeId: r.place_id,
            destinationId: r.destination_id,
            party: r.party,
            lang: r.lang,
            createdAt: r.created_at.toISOString(),
          },
          ...(job.resource_id
            ? { resourceRef: cfg.resources[job.resource_id] }
            : {}),
        }),
      });
      if (!response.ok) {
        transient = response.status === 429 || response.status >= 500;
        code = `upstream_${response.status}`;
        throw Error();
      }
      if (Number(response.headers.get("content-length") ?? 0) > 16384) {
        code = "invalid_response";
        throw Error();
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (!reader) {
        code = "invalid_response";
        throw Error();
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) {
          await reader.cancel();
          code = "invalid_response";
          throw Error();
        }
        chunks.push(value);
      }
      const text = Buffer.concat(chunks).toString("utf8");
      code = "invalid_response";
      const data = JSON.parse(text);
      code = "";
      if (
        !data ||
        data.jobId !== job.id ||
        data.status !== "accepted" ||
        typeof data.externalId !== "string" ||
        !/^[a-zA-Z0-9_.:-]{1,120}$/.test(data.externalId)
      ) {
        code = "invalid_acknowledgement";
        throw Error();
      }
      await db.query(
        `update integration_jobs set state='acknowledged',external_id=$2,last_error='',lease_until=null,updated_at=$3,version=version+1 where id=$1 and state='sending' and version=$4`,
        [job.id, data.externalId, now, job.version],
      );
    } catch {
      if (!code) {
        transient = true;
        code = "network_or_timeout";
      }
      const retry = transient && job.attempts < 5;
      await db.query(
        `update integration_jobs set state=$2,last_error=$3,next_attempt_at=$4,lease_until=null,updated_at=$5,version=version+1 where id=$1 and state='sending' and version=$6`,
        [
          job.id,
          retry ? "pending" : "failed",
          code,
          new Date(now.getTime() + Math.min(300000, 15000 * 2 ** job.attempts)),
          now,
          job.version,
        ],
      );
    }
  }
  return { processed: jobs.length, mode: "sandbox" };
}
export function verifyIntegrationSignature(
  raw: string,
  timestamp: string,
  signature: string,
  secret: string,
  now: Date,
) {
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now.getTime() - Number(timestamp) * 1000) > 300000 ||
    !/^sha256=[a-f0-9]{64}$/.test(signature) ||
    secret.length < 32
  )
    return false;
  const expected = Buffer.from(
    "sha256=" +
      createHmac("sha256", secret)
        .update(timestamp + "." + raw)
        .digest("hex"),
  );
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
export async function integrationCallback(
  db: Db,
  channel: IntegrationChannel,
  raw: string,
  timestamp: string,
  signature: string,
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (raw.length > 16384) return fail(413, "요청 크기를 확인해 주세요");
  const cfg = bridgeConfig(channel, env);
  if (
    "state" in cfg ||
    !verifyIntegrationSignature(
      raw,
      timestamp,
      signature,
      cfg.webhookSecret,
      now,
    )
  )
    return fail(401, "연동 서명을 확인해 주세요");
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "잘못된 이벤트");
  }
  if (
    !body ||
    !isUuid(body.jobId) ||
    !["in_progress", "completed", "failed", "cancelled"].includes(
      body.status,
    ) ||
    !Number.isSafeInteger(body.sequence) ||
    body.sequence < 1 ||
    typeof body.externalId !== "string" ||
    !/^[a-zA-Z0-9_.:-]{1,120}$/.test(body.externalId)
  )
    return fail(400, "이벤트 형식을 확인해 주세요");
  const changed = await db.query(
    `update integration_jobs j set state=$4,sequence=$5,updated_at=$6,version=j.version+1 from service_requests r where j.request_id=r.id and j.id=$1 and j.channel=$2 and j.external_id=$3 and r.expires_at>$6 and r.state in ('received','assigned','en_route','arrived','serving') and j.sequence<$5 and j.state in ('acknowledged','in_progress') returning j.id`,
    [
      body.jobId,
      channel,
      body.externalId,
      body.status === "cancelled" ? "stopped" : body.status,
      body.sequence,
      now,
    ],
  );
  return ok({
    received: true,
    applied: changed.length === 1,
    passengerStateChanged: false,
  });
}
