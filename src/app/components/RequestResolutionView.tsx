import { businessOf } from "@/lib/operating-profile";
import {
  RESOLUTION_EN,
  RESOLUTION_LABEL,
  type RequestResolution,
} from "@/lib/request-resolution";

export function RequestResolutionView({
  resolution,
  lang = "ko",
}: {
  resolution: RequestResolution;
  lang?: "ko" | "en";
}) {
  const en = lang === "en",
    business = businessOf(resolution.businessId);
  return (
    <section
      className="request-resolution"
      aria-label={en ? "Handling result" : "처리 결과"}
    >
      <h3>{en ? "Handling result" : "처리 결과"}</h3>
      <p>
        <strong>
          {en
            ? RESOLUTION_EN[resolution.kind]
            : RESOLUTION_LABEL[resolution.kind]}
        </strong>
      </p>
      {business && (
        <p>
          {en ? "Service responsibility: " : "담당 업무: "}
          {en ? business.en : business.label}
        </p>
      )}
      <p className="request-resolution-message">{resolution.message}</p>
      {resolution.kind === "referral" && (
        <p className="fine">
          {en
            ? "Staff provided the service contact. This does not confirm that the department has accepted your enquiry."
            : "담당 창구를 안내한 결과입니다. 해당 부서의 접수 완료를 뜻하지 않습니다."}
        </p>
      )}
      {resolution.kind === "handoff" && (
        <p className="fine">
          {en
            ? "Confirmed manually by staff. This does not mean the underlying issue has been resolved."
            : "직원이 인계 사실을 확인한 기록입니다. 문의한 문제의 조치 완료와는 구분됩니다."}
        </p>
      )}
    </section>
  );
}
