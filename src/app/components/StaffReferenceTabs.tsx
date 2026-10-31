"use client";

import { Children, useId, useRef, useState, type ReactNode } from "react";

export function StaffReferenceTabs({
  labels,
  children,
}: {
  labels: string[];
  children: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <>
      <div
        className="staff-section-nav"
        role="tablist"
        aria-label="운영 기준 항목"
      >
        {labels.map((label, index) => (
          <button
            key={label}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % labels.length
                  : event.key === "ArrowLeft"
                    ? (index + labels.length - 1) % labels.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? labels.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setActive(next);
                buttons.current[next]?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {Children.toArray(children).map((child, index) => (
        <div
          key={index}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={active !== index}
          tabIndex={0}
        >
          {child}
        </div>
      ))}
    </>
  );
}
