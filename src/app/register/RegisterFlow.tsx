"use client";

import { useRouter } from "next/navigation";
import { RegistrationSteps, type FlightOption, type RegistrationPayload } from "../components/RegistrationSteps";

export const RECEIPT_KEY = "jsp:receipt";

/** 등록 완료 화면에 보여줄 것. 이 탭에만 두고, 탭을 닫으면 사라진다. */
export interface ReceiptInfo {
  receiptNo: string;
  name: string;
  flightNo: string;
  destName: string;
  when: string;
}

export function RegisterFlow({ mock }: { mock: boolean }) {
  const router = useRouter();

  async function submit(payload: RegistrationPayload, flight: FlightOption): Promise<string | null> {
    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "등록하지 못했습니다. 다시 시도해 주세요.";
      // 접수 번호는 주소에 넣지 않는다. 이 탭에만 둔다.
      const info: ReceiptInfo = {
        receiptNo: data.receiptNo,
        name: payload.name,
        flightNo: flight.flightNo,
        destName: flight.destName,
        when: `${flight.day} ${flight.time}`,
      };
      sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(info));
      router.push("/register/done");
      return null;
    } catch {
      return "연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  return <RegistrationSteps mock={mock} onExit={() => router.push("/")} onSubmit={submit} />;
}
