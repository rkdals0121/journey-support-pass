import { Clock3, MapPin, ChevronRight } from "lucide-react";
import {
  requestServiceLabel,
  requestStateLabel,
  type ServiceRequestView,
} from "@/lib/service-request-model";
export function RequestCards({
  rows,
  selectedId,
  zoneLabels,
  onSelect,
  ready,
  onReset,
}: {
  rows: ServiceRequestView[];
  selectedId?: string;
  zoneLabels: Record<string, string>;
  onSelect: (id: string) => void;
  ready: boolean;
  onReset: () => void;
}) {
  if (!rows.length)
    return (
      <div className="work-mobile-empty" role="status">
        <strong>
          {ready ? "표시할 요청이 없습니다" : "요청을 불러오는 중입니다"}
        </strong>
        {ready && (
          <button type="button" onClick={onReset}>
            검색·필터 초기화
          </button>
        )}
      </div>
    );
  return (
    <ul className="work-mobile-list" aria-label="접수 목록">
      {rows.map((r) => {
        const minutes = Math.max(
          0,
          Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60000),
        );
        return (
          <li key={r.id}>
            <button
              type="button"
              data-select-mobile={r.id}
              aria-pressed={selectedId === r.id}
              aria-controls={"request-detail-" + r.id}
              onClick={() => onSelect(r.id)}
            >
              <span className="mobile-request-top">
                <strong>{requestServiceLabel(r)}</strong>
                <span className={"mobile-request-state state-" + r.state}>
                  {requestStateLabel(r)}
                </span>
              </span>
              <span className="mobile-request-place">
                <MapPin aria-hidden="true" />
                {r.place}
              </span>
              <span className="mobile-request-meta">
                <span>
                  <Clock3 aria-hidden="true" />
                  {minutes < 60
                    ? minutes + "분 전"
                    : Math.floor(minutes / 60) + "시간 전"}
                </span>
                <span>
                  {r.assignedZone
                    ? (zoneLabels[r.assignedZone] ?? r.assignedZone)
                    : "담당자 미배정"}
                </span>
                <ChevronRight aria-hidden="true" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
