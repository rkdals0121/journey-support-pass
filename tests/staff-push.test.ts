import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import {
  configurePush,
  notifyNewRequest,
  validSubscription,
  pushConfig,
} from "@/lib/staff-push";
import { createTestDb, kst } from "./helpers/db";
import { sessionOf, kioskSession } from "./helpers/fixtures";
import { seedZones } from "@/lib/zones";
import type { Db } from "@/lib/db";
import webpush from "web-push";
import { createServiceRequest } from "@/lib/service-requests";
vi.mock("web-push", () => ({
  default: { sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }) },
}));
let db: Db;
const now = kst("2026-10-25 15:00");
const session = sessionOf(now);
const sub = (id = "one") => ({
  endpoint: "https://fcm.googleapis.com/fcm/send/" + id,
  keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
});
async function makeRequestId() {
  const result = await createServiceRequest(
    db,
    null,
    {
      receipt: "a".repeat(64),
      service: "guidance",
      placeId: "cc-center",
      choices: [],
      party: 1,
      note: "",
      lang: "ko",
      consent: true,
    },
    "push:test",
    now,
  );
  return (result.body.request as { id: string }).id;
}
beforeAll(async () => {
  db = await createTestDb();
  await seedZones(db, () => "x:y");
});
beforeEach(async () => {
  await db.exec(
    "truncate service_requests,service_request_limits,request_push_subscriptions cascade",
  );
  vi.clearAllMocks();
  vi.mocked(webpush.sendNotification).mockResolvedValue({
    statusCode: 201,
    body: "",
    headers: {},
  });
  vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "public-test-key");
  vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "private-test-key");
  vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:operator@example.com");
});
afterEach(() => vi.unstubAllEnvs());
describe("직원 브라우저 알림", () => {
  it("설정이 없으면 외부 발송을 하지 않는다", async () => {
    vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "");
    expect(pushConfig().enabled).toBe(false);
    await notifyNewRequest(db, "id", now);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
  it("직원만 알림 기기를 등록하고 키오스크·미선택 구역·만료 세션은 거절한다", async () => {
    for (const s of [
      null,
      kioskSession(now, "cc-center"),
      { ...session, needsZone: true },
      { ...session, exp: now.getTime() },
    ])
      expect((await configurePush(db, s, sub(), now)).status).toBe(401);
    expect((await configurePush(db, session, sub(), now)).status).toBe(200);
  });
  it("임의 URL, HTTP, 자격정보, 잘못된 키를 거절한다", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/a",
      "https://127.0.0.1/a",
      "https://fcm.googleapis.com.evil.example/a",
      "https://user@fcm.googleapis.com/a",
      "https://fcm.googleapis.com:8443/a",
    ])
      expect(validSubscription({ ...sub(), endpoint })).toBe(false);
    expect(
      validSubscription({ ...sub(), keys: { auth: "", p256dh: "" } }),
    ).toBe(false);
    expect(validSubscription(null)).toBe(false);
  });
  it("주요 브라우저 푸시 주소를 허용한다", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/a",
      "https://updates.push.services.mozilla.com/a",
      "https://web.push.apple.com/a",
    ])
      expect(validSubscription({ ...sub(), endpoint })).toBe(true);
  });
  it("등록을 갱신하면 현재 근무 구역과 로그인 만료를 따른다", async () => {
    await configurePush(db, session, sub(), now);
    const changed = { ...session, zoneId: "cc-mid", exp: session.exp + 1000 };
    await configurePush(db, changed, sub(), now);
    const rows = await db.query<{ zone_id: string; expires_at: Date }>(
      "select zone_id,expires_at from request_push_subscriptions",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].zone_id).toBe("cc-mid");
    expect(rows[0].expires_at.getTime()).toBe(changed.exp);
  });
  it("알림에는 요청 내용·위치·개인정보나 확인용 링크가 없다", async () => {
    await configurePush(db, session, sub(), now);
    const id = await makeRequestId();
    await notifyNewRequest(db, id, now);
    const [, payload, options] = vi.mocked(webpush.sendNotification).mock
      .calls[0];
    expect(JSON.parse(payload as string)).toMatchObject({
      title: "새 도움 요청",
      body: "통합 요청 화면에서 접수 내용을 확인해 주세요.",
      tag: "request-" + id,
    });
    expect(options?.timeout).toBe(3000);
  });
  it("만료된 로그인 기기는 정리하고 발송하지 않는다", async () => {
    await configurePush(db, session, sub(), now);
    const id = await makeRequestId();
    await notifyNewRequest(db, id, new Date(session.exp + 1));
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(
      await db.query("select id from request_push_subscriptions"),
    ).toHaveLength(0);
  });
  it("푸시 서버가 기기 폐기를 알리면 구독을 지운다", async () => {
    await configurePush(db, session, sub(), now);
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 410 });
    const id = await makeRequestId();
    await expect(notifyNewRequest(db, id, now)).resolves.toBeUndefined();
    expect(
      await db.query("select id from request_push_subscriptions"),
    ).toHaveLength(0);
  });
  it("일시적인 발송 실패는 구독과 접수를 유지한다", async () => {
    await configurePush(db, session, sub(), now);
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 503 });
    const id = await makeRequestId();
    await expect(notifyNewRequest(db, id, now)).resolves.toBeUndefined();
    expect(
      await db.query("select id from request_push_subscriptions"),
    ).toHaveLength(1);
  });
  it("다른 구역에서 해제할 수 없고 본인 구역에서는 해제된다", async () => {
    await configurePush(db, session, sub(), now);
    await configurePush(db, { ...session, zoneId: "cc-mid" }, sub(), now, true);
    expect(
      await db.query("select id from request_push_subscriptions"),
    ).toHaveLength(1);
    await configurePush(db, session, sub(), now, true);
    expect(
      await db.query("select id from request_push_subscriptions"),
    ).toHaveLength(0);
  });
});
