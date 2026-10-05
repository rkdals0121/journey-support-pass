"use client";

import { useRouter } from "next/navigation";
import { RegistrationSteps, type RegistrationPayload } from "../components/RegistrationSteps";

export const RECEIPT_KEY = "jsp:receipt";

export function RegisterFlow({ mock }: { mock: boolean }) {
  const router = useRouter();

  async function submit(payload: RegistrationPayload): Promise<string | null> {
    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "등록하지 못했습니다. 다시 시도해 주세요.";
      // 접수 번호는 주소에 넣지 않는다. 이 탭에만 둔다.
      sessionStorage.setItem(RECEIPT_KEY, data.receiptNo);
      router.push("/register/done");
      return null;
    } catch {
      return "연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  return <RegistrationSteps mock={mock} onSubmit={submit} />;
}
