"use client";
import { useEffect, useState } from "react";
export function OperatorClose({
  version,
  disabled,
  onClose,
}: {
  version: number;
  disabled: boolean;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setConfirmed(false);
  }, [version]);
  return (
    <div className="dx-notice">
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={disabled}
        />
        실제 지원 상태와 중복 여부를 확인했습니다
      </label>
      <p className="fine">
        종료 사유를 기록하고 취소 상태로 닫습니다. 완료 실적에는 포함하지
        않습니다.
      </p>
      <button
        className="btn btn-ghost"
        disabled={disabled || !confirmed}
        onClick={onClose}
      >
        현장 확인 후 요청 종료
      </button>
    </div>
  );
}
