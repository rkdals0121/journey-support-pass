const KEY = "jsp-dx-receipts-v2";
export function readRequestReceipts(): string[] {
  try {
    const history: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "[]"),
      current = sessionStorage.getItem("jsp-dx-receipt-v1");
    return [
      ...new Set(
        [...(Array.isArray(history) ? history : []), current].filter(
          (v): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v),
        ),
      ),
    ].slice(0, 10);
  } catch {
    return [];
  }
}
export function rememberRequestReceipt(receipt: string) {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify(
        [receipt, ...readRequestReceipts().filter((r) => r !== receipt)].slice(
          0,
          10,
        ),
      ),
    );
  } catch {}
}
