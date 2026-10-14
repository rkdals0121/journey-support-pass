/*
 * 고유 일련 번호 화면(/p/{token})을 인터넷이 끊겨도 열리게 하는 서비스 워커.
 *
 * 공항 안에서는 휴대전화 데이터나 와이파이가 잠깐씩 끊긴다. 키오스크 앞에서 QR 을 보여 주려는 순간
 * 화면이 안 열리면 안 되므로, 이 화면을 마지막으로 받은 그대로 휴대전화에 남겨 둔다.
 *
 *  - 고유 일련 번호 화면: 먼저 인터넷으로 받는다(탑승구가 바뀌었을 수 있다). 받으면 휴대전화에 남기고,
 *    못 받으면 남겨 둔 것을 보여 준다.
 *  - 화면을 그리는 데 쓰는 파일(/_next/static/): 이름에 내용이 들어 있어 바뀌지 않으므로 남겨 둔 것을 먼저 쓴다.
 *  - 그 밖의 요청(등록, 키오스크, 직원 화면, 모든 API)은 건드리지 않는다.
 *
 * 남겨 두는 것은 그 휴대전화에서 연 패스 화면뿐이다. 「내 등록 지우기」를 누르면 화면이 지우라고 알려 와서 바로 지운다.
 * 항공편이 출발한 뒤 인터넷이 될 때 다시 열면 "사용이 끝난 패스" 화면이 남겨 둔 것을 덮어쓴다.
 */
const PASS_CACHE = "jsp-pass-v1";
const STATIC_CACHE = "jsp-static-v1";
const PASS_PATH = /^\/p\/([A-Za-z0-9]{16})\/?$/i;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 이름이 바뀐 예전 저장소는 지운다.
      for (const key of await caches.keys()) {
        if (key.startsWith("jsp-") && key !== PASS_CACHE && key !== STATIC_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// 대문자 /P/ 와 소문자 /p/, 뒤에 붙은 ?new=1 을 같은 화면으로 본다.
function passKey(url) {
  const m = url.pathname.match(PASS_PATH);
  return m ? `${url.origin}/p/${m[1].toUpperCase()}` : null;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const key = req.mode === "navigate" ? passKey(url) : null;
  if (key) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PASS_CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) await cache.put(key, res.clone());
          return res;
        } catch {
          const saved = await cache.match(key);
          if (saved) return saved;
          throw new Error("offline");
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const saved = await cache.match(req);
        if (saved) return saved;
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});

// 등록 직후 처음 연 화면은 이 워커가 맡기 전에 열린 것이라 남지 않는다.
// 그래서 화면이 "이 패스를 남겨 달라"고 알려 오면 한 번 더 받아 남기고, 그 화면이 쓰는 파일도 함께 남긴다.
async function savePass(token) {
  const key = `${self.location.origin}/p/${token.toUpperCase()}`;
  const res = await fetch(key, { credentials: "same-origin" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await (await caches.open(PASS_CACHE)).put(key, res);
  const files = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) || [])];
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    files.map(async (path) => {
      if (await cache.match(path)) return;
      try {
        const r = await fetch(path);
        if (r.ok) await cache.put(path, r);
      } catch {
        // 하나 못 받아도 나머지는 남긴다. QR 은 화면 글(HTML)에 들어 있어 파일이 없어도 보인다.
      }
    }),
  );
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (typeof data.token !== "string" || !/^[A-Za-z0-9]{16}$/.test(data.token)) return;
  if (data.type === "save-pass") event.waitUntil(savePass(data.token).catch(() => {}));
  // 화면이 "이 패스를 지워 달라"고 알려 오면 남겨 둔 것을 지운다.
  if (data.type === "forget-pass") {
    const key = `${self.location.origin}/p/${data.token.toUpperCase()}`;
    event.waitUntil(caches.open(PASS_CACHE).then((cache) => cache.delete(key)));
  }
});
