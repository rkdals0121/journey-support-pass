import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
const NAME = "jsp_support_crew";
export async function crewKey(create = false) {
  const jar = await cookies();
  let key = jar.get(NAME)?.value ?? "";
  if (!/^[a-f0-9]{64}$/.test(key)) {
    key = create ? randomBytes(32).toString("hex") : "";
    if (create) jar.set(NAME, key, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 4 * 3600 });
  }
  return key;
}
