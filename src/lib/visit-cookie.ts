import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
/** A browser identifier for rate limits, rather than treating shared airport Wi-Fi as one person. */
export async function visitDeviceKey() {
  const jar = await cookies();
  let value = jar.get("jsp_visit_device")?.value ?? "";
  if (!/^[a-f0-9]{64}$/.test(value)) {
    value = randomBytes(32).toString("hex");
    jar.set("jsp_visit_device", value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 86400,
    });
  }
  return createHash("sha256").update(value).digest("hex");
}
