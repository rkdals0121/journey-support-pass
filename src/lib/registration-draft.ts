import { cleanExtra, knownCodes, type Extra } from "./catalog";
import type { FlightOption } from "../app/components/RegisterFlow";

export const REGISTRATION_DRAFT = "jspRegistrationDraft";
const TTL = 60 * 60 * 1000;
export interface RegistrationDraft {
  at: number;
  context: string;
  lang: "ko" | "en";
  choices: string[];
  extra: Extra;
  step: number;
  query: string;
  later: boolean;
  laterDate: string;
  laterNo: string;
  flight: FlightOption | null;
  docs: ("welfare" | "family" | "maternity" | "doctor")[];
  noDocs: boolean;
  proofOk: Partial<
    Record<"welfare" | "family" | "maternity" | "doctor", boolean>
  >;
}
export function readRegistrationDraft(
  value: unknown,
  context: string,
  now = Date.now(),
): RegistrationDraft | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Partial<RegistrationDraft>;
  if (
    typeof d.at !== "number" ||
    now < d.at ||
    now - d.at > TTL ||
    d.context !== context ||
    !Array.isArray(d.choices) ||
    d.choices.some((c) => typeof c !== "string") ||
    !Number.isInteger(d.step) ||
    d.step! < 0 ||
    d.step! > 30
  )
    return null;
  const f = d.flight;
  const docs = Array.isArray(d.docs)
    ? [...new Set(d.docs)].filter((v): v is RegistrationDraft["docs"][number] =>
        ["welfare", "family", "maternity", "doctor"].includes(v),
      )
    : [];
  const proofOk = Object.fromEntries(
    docs.map((key) => [key, d.proofOk?.[key] === true]),
  );
  const flight =
    f &&
    [f.airline, f.flightDate, f.flightNo, f.destName, f.destCode, f.time].every(
      (v) => typeof v === "string" && v.length <= 100,
    ) &&
    (f.day === "today" || f.day === "tomorrow") &&
    typeof f.cancelled === "boolean"
      ? {
          airline: f.airline,
          flightDate: f.flightDate,
          flightNo: f.flightNo,
          destName: f.destName,
          destCode: f.destCode,
          time: f.time,
          day: f.day,
          cancelled: f.cancelled,
          later: f.later === true,
        }
      : null;
  return {
    at: d.at,
    context,
    lang: d.lang === "en" ? "en" : "ko",
    choices: knownCodes(d.choices),
    extra: cleanExtra(d.extra ?? {}),
    step: d.step!,
    query: typeof d.query === "string" ? d.query.slice(0, 80) : "",
    later: d.later === true,
    laterDate: typeof d.laterDate === "string" ? d.laterDate.slice(0, 10) : "",
    laterNo: typeof d.laterNo === "string" ? d.laterNo.slice(0, 7) : "",
    flight,
    docs,
    noDocs: d.noDocs === true,
    proofOk,
  };
}
/** Includes Cheonjiin's arae-a and modern/archaic Hangul composition characters. */
export function normalizeFlightQuery(value: string) {
  return value
    .toUpperCase()
    .replace(
      /[^A-Z0-9가-힣\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff ]/g,
      "",
    )
    .trimStart()
    .slice(0, 16);
}
