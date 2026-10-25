/* Dedicated /staff/ scope. Never cache staff pages or passenger details. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {
    /* Generic notification only. */
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification("새 도움 요청", {
        body: "통합 요청 화면에서 접수 내용을 확인해 주세요.",
        tag: typeof data.tag === "string" ? data.tag : "service-request",
      });
      if (typeof data.receivedToken === "string") {
        try {
          await fetch("/api/staff/push/received", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: data.receivedToken }),
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          /* An unconfirmed receipt remains unknown, never assumed received. */
        }
      }
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (client) => new URL(client.url).pathname === "/staff/requests",
      );
      if (existing) return existing.focus();
      return self.clients.openWindow("/staff/requests");
    })(),
  );
});
