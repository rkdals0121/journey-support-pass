"use client";
import { useState } from "react";
import { BUSINESS_AREAS } from "@/lib/operating-profile";
import { supportTopic } from "@/lib/service-catalog";
import {
  RESOLUTION_KINDS,
  RESOLUTION_LABEL,
  type ResolutionKind,
} from "@/lib/request-resolution";
import type { ServiceRequestView } from "@/lib/service-request-model";

export function BusinessHandling({
  request,
  busy,
  onAction,
}: {
  request: ServiceRequestView;
  busy: boolean;
  onAction: (
    action: "classify_business" | "complete",
    extra: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [businessId, setBusinessId] = useState(request.businessId ?? "");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<ResolutionKind>(
    request.serviceDetails?.task ? "resolved" : "advice",
  );
  const [resultBusiness, setResultBusiness] = useState(
    request.businessId ?? "",
  );
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const confirmNeeded = kind === "handoff" || kind === "resolved";
  const businessNeeded = kind === "handoff" || kind === "referral";
  const requiresResult = supportTopic(request.topicId)?.mode === "referral";
  const prefix = "business-" + request.id;
  const completion = (
    <form
      className="business-result-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onAction("complete", {
          resolution: {
            kind,
            businessId: resultBusiness || null,
            message,
            confirmed,
          },
        });
      }}
    >
      <h3>처리 결과 기록</h3>
      <p className="fine">
        결과는 여객에게도 표시됩니다. 개인 연락처나 내부 메모는 적지 마세요.
      </p>
      <label htmlFor={prefix + "-kind"}>처리 결과 유형</label>
      <select
        id={prefix + "-kind"}
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as ResolutionKind);
          setConfirmed(false);
        }}
      >
        {RESOLUTION_KINDS.map((k) => (
          <option key={k} value={k}>
            {RESOLUTION_LABEL[k]}
          </option>
        ))}
      </select>
      <label htmlFor={prefix + "-result-business"}>
        안내·처리한 담당 업무{businessNeeded ? " · 필수" : " · 선택"}
      </label>
      <select
        id={prefix + "-result-business"}
        value={resultBusiness}
        required={businessNeeded}
        onChange={(e) => {
          setResultBusiness(e.target.value);
          setConfirmed(false);
        }}
      >
        <option value="">담당 업무 선택</option>
        {BUSINESS_AREAS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
      <label htmlFor={prefix + "-message"}>
        여객에게 전달할 처리 결과 · 필수
      </label>
      <textarea
        id={prefix + "-message"}
        maxLength={240}
        required
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={
          request.lang === "en"
            ? "여객은 영어 안내를 선택했습니다. 가능한 영어로 적어 주세요."
            : "안내한 내용, 연결한 창구, 다음 행동 등을 적어 주세요."
        }
      />
      {kind === "referral" && (
        <p className="fine">
          창구 안내만 완료한 경우입니다. 부서 접수나 조치 완료로 기록하지
          않습니다.
        </p>
      )}
      {confirmNeeded && (
        <label className="business-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          {kind === "handoff"
            ? "담당 부서가 문의를 넘겨받은 사실을 직접 확인했습니다."
            : "문의한 사항의 현장 조치가 끝난 사실을 직접 확인했습니다."}
        </label>
      )}
      <button
        className="btn btn-primary"
        type="submit"
        disabled={
          busy ||
          !message.trim() ||
          (businessNeeded && !resultBusiness) ||
          (confirmNeeded && !confirmed)
        }
      >
        처리 결과 기록 후 완료
      </button>
    </form>
  );
  return (
    <div className="business-handling">
      <details>
        <summary>담당 업무 분류 확인·변경</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onAction("classify_business", { businessId, reason });
          }}
        >
          <p className="fine">
            업무 분류를 바꾸어도 담당 구역이나 실제 부서로 자동 전송되지
            않습니다.
          </p>
          <label htmlFor={prefix + "-target"}>담당 업무</label>
          <select
            id={prefix + "-target"}
            value={businessId}
            required
            onChange={(e) => setBusinessId(e.target.value)}
          >
            <option value="">업무를 골라 주세요</option>
            {BUSINESS_AREAS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <label htmlFor={prefix + "-reason"}>
            분류 변경 사유 · 직원 이력에 기록
          </label>
          <input
            id={prefix + "-reason"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={120}
            required
          />
          <button
            className="btn btn-ghost"
            disabled={
              busy ||
              !reason.trim() ||
              !businessId ||
              businessId === request.businessId
            }
          >
            사유 기록 후 업무 분류 변경
          </button>
        </form>
      </details>
      {request.state === "serving" &&
        (requiresResult ? (
          completion
        ) : (
          <details>
            <summary>처리 결과를 남기고 완료하기 · 선택</summary>
            {completion}
          </details>
        ))}
    </div>
  );
}
