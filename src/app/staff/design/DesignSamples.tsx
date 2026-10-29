"use client";
import { useState } from "react";
import { Check, Info, AlertTriangle, ArrowRight } from "lucide-react";
export function DesignSamples() {
  const [selected, setSelected] = useState(false),
    [shown, setShown] = useState(false);
  return (
    <div className="design-samples">
      <section>
        <h2>색과 글자</h2>
        <div className="design-swatches">
          {[
            "canvas",
            "surface",
            "primary",
            "primary-soft",
            "accent",
            "accent-soft",
            "text",
            "muted",
          ].map((name) => (
            <div key={name}>
              <span style={{ background: `var(--color-${name})` }} />
              <code>{name}</code>
            </div>
          ))}
        </div>
        <p>본문은 필요한 안내를 명료하게 전달합니다.</p>
        <p className="muted">보조 문구는 행동을 결정하는 정보에만 씁니다.</p>
        <div className="gate-sign">
          <span>탑승구</span>
          <strong>130</strong>
        </div>
      </section>
      <section>
        <h2>버튼과 입력</h2>
        <div className="design-actions">
          <button
            className="btn btn-primary"
            onClick={() => setShown((v) => !v)}
          >
            상태 확인
            <ArrowRight aria-hidden="true" />
          </button>
          <button className="btn">보조 동작</button>
          <button className="btn" disabled>
            비활성 동작
          </button>
        </div>
        <label htmlFor="design-field">입력 예시</label>
        <input id="design-field" placeholder="필요한 내용을 입력하세요" />
        <label className="choice">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => setSelected(e.target.checked)}
          />
          <span>선택 예시</span>
          {selected && <Check aria-hidden="true" />}
        </label>
      </section>
      <section>
        <h2>상태 안내</h2>
        <p className="design-notice">
          <Info aria-hidden="true" />
          직원이 요청을 확인하고 있습니다.
        </p>
        <p className="design-error">
          <AlertTriangle aria-hidden="true" />
          연결을 확인한 뒤 다시 시도해 주세요.
        </p>
        {shown && (
          <p role="status" className="design-notice">
            <Check aria-hidden="true" />
            상태가 변경되었습니다.
          </p>
        )}
        <details>
          <summary>추가 정보 펼치기</summary>
          <p>필요한 경우에만 상세 정보를 표시합니다.</p>
        </details>
      </section>
    </div>
  );
}
