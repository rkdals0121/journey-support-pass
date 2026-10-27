import { createHmac } from "node:crypto";
import { config } from "./config";
import { kstDate } from "./flights/normalize";
import { parseBoardingPass, type BoardingPass } from "./pass-format";

/** Single-leg IATA BCBP mandatory fields. Parsing is not airline validation or eligibility approval. */
export function readBoardingPayload(
  scanned: string,
  now: Date,
): BoardingPass | null {
  const legacy = parseBoardingPass(scanned);
  if (legacy) return legacy;
  const raw = scanned.replace(/[\r\n]+$/, "").toUpperCase();
  if (
    raw.length < 60 ||
    raw.length > 4096 ||
    !raw.startsWith("M1") ||
    !/^[\x20-\x7e]+$/.test(raw)
  )
    return null;
  const pnr = raw.slice(23, 30).trim(),
    from = raw.slice(30, 33),
    to = raw.slice(33, 36);
  const carrier = raw.slice(36, 39).trim(),
    number = raw.slice(39, 44).trim();
  const dayText = raw.slice(44, 47),
    variableText = raw.slice(58, 60);
  if (
    !/^[A-Z0-9]{1,7}$/.test(pnr) ||
    !/^[A-Z]{3}$/.test(from) ||
    !/^[A-Z]{3}$/.test(to) ||
    !/^[A-Z0-9]{2,3}$/.test(carrier) ||
    !/^\d{1,5}[A-Z]?$/.test(number) ||
    !/^\d{3}$/.test(dayText) ||
    !/^[A-F0-9]{2}$/.test(variableText) ||
    raw.length < 60 + parseInt(variableText, 16)
  )
    return null;
  const day = Number(dayText),
    year = Number(kstDate(now).slice(0, 4));
  const candidates = [year - 1, year, year + 1]
    .map((y) => {
      const date = new Date(Date.UTC(y, 0, day));
      return day >= 1 && date.getUTCFullYear() === y ? date : null;
    })
    .filter((d): d is Date => !!d)
    .sort((a, b) => Math.abs(+a - +now) - Math.abs(+b - +now));
  if (!candidates[0]) return null;
  const date = candidates[0].toISOString().slice(0, 10);
  const flightNo = carrier + number.replace(/^0+(?=\d)/, "");
  const ref = createHmac("sha256", config.sessionSecret)
    .update("bcbp-v1:" + date + ":" + raw.slice(0, 58))
    .digest("hex")
    .slice(0, 32)
    .toUpperCase();
  return { flightDate: date, flightNo, ref };
}
