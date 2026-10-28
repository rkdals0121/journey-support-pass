"use client";
import { PlaceFinder } from "./PlaceFinder";
import { placeOf } from "@/lib/airport";
import { OfficialMapPanel } from "./OfficialMapPanel";
export function ReportLocationPicker({
  fields,
  onChange,
  en = false,
  disabled = false,
  photos = true,
}: {
  fields: Record<string, string>;
  onChange: (fields: Record<string, string>) => void;
  en?: boolean;
  disabled?: boolean;
  photos?: boolean;
}) {
  const set = (key: string, value: string) =>
    onChange({ ...fields, [key]: value });
  return (
    <div className="report-location-picker">
      <OfficialMapPanel en={en} />
      <label htmlFor="report-area">{en ? "Terminal" : "터미널"}</label>
      <select
        id="report-area"
        required
        disabled={disabled}
        value={fields.reportArea ?? ""}
        onChange={(e) => set("reportArea", e.target.value)}
      >
        <option value="">{en ? "Select terminal" : "터미널 선택"}</option>
        <option value="T1">{en ? "Terminal 1" : "제1터미널"}</option>
        <option value="CONCOURSE">{en ? "Concourse" : "탑승동"}</option>
        <option value="T2">{en ? "Terminal 2" : "제2터미널"}</option>
      </select>
      <label htmlFor="report-level">{en ? "Floor" : "층"}</label>
      <select
        id="report-level"
        required
        disabled={disabled}
        value={fields.reportLevel ?? ""}
        onChange={(e) => set("reportLevel", e.target.value)}
      >
        <option value="">{en ? "Select floor" : "층 선택"}</option>
        {["B1", "1", "2", "3", "4", "5"].map((n) => (
          <option key={n} value={n}>
            {n === "B1" ? (en ? "B1" : "지하 1층") : n + (en ? "F" : "층")}
          </option>
        ))}
      </select>
      <label htmlFor="report-location">
        {en ? "Nearby gate, entrance or landmark" : "근처 탑승구·출입구·매장"}
      </label>
      <input
        id="report-location"
        required
        disabled={disabled}
        maxLength={120}
        value={fields.reportLocation ?? ""}
        placeholder={
          en
            ? "e.g. beside Gate 130, opposite the café"
            : "예: 130번 탑승구 옆, 카페 맞은편"
        }
        onChange={(e) => set("reportLocation", e.target.value)}
      />
      {photos && (
        <details className="report-photo-helper">
          <summary>
            {en
              ? "Use a gate or sign photo"
              : "탑승구·안내판 사진으로 위치 찾기"}
          </summary>
          <PlaceFinder
            id="report-photo"
            showMap={false}
            purpose="report"
            value=""
            en={en}
            disabled={disabled}
            onChange={(id) => {
              const p = placeOf(id);
              const gate = p?.label.match(/(\d+)번/)?.[1];
              if (p && gate)
                onChange({
                  ...fields,
                  reportArea: p.area,
                  reportLevel: p.level < 0 ? "B" + -p.level : String(p.level),
                  reportLocation: en
                    ? `Near Gate ${gate}`
                    : `${gate}번 탑승구 부근`,
                });
            }}
          />
        </details>
      )}
    </div>
  );
}
