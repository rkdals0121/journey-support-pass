/**
 * 항공사 두 글자 코드 → 영어 이름. 운항 정보에는 항공사 이름이 한국어로만 온다.
 * 편명의 앞 두 글자가 항공사 코드다. 여기에 없는 항공사는 코드를 그대로 보여 준다.
 */
const AIRLINE: Record<string, string> = {
  KE: "Korean Air", OZ: "Asiana Airlines", "7C": "Jeju Air", LJ: "Jin Air", TW: "T'way Air", BX: "Air Busan", ZE: "Eastar Jet",
  RS: "Air Seoul", YP: "Air Premia", WE: "Parata Air", RF: "Aero K",
  JL: "Japan Airlines", NH: "ANA", MM: "Peach", ZG: "ZIPAIR", GK: "Jetstar Japan",
  CA: "Air China", MU: "China Eastern", CZ: "China Southern", FM: "Shanghai Airlines", SC: "Shandong Airlines", MF: "Xiamen Air",
  HO: "Juneyao Air", QW: "Qingdao Airlines", "9C": "Spring Airlines", ZH: "Shenzhen Airlines", "3U": "Sichuan Airlines", HU: "Hainan Airlines",
  CX: "Cathay Pacific", UO: "HK Express", HX: "Hong Kong Airlines", NX: "Air Macau", BR: "EVA Air", CI: "China Airlines",
  IT: "Tigerair Taiwan", B7: "UNI Air", JX: "Starlux", OM: "MIAT Mongolian",
  TG: "Thai Airways", FD: "Thai AirAsia", VZ: "Thai Vietjet", XJ: "Thai AirAsia X", VN: "Vietnam Airlines", VJ: "Vietjet Air",
  "9G": "Sun PhuQuoc Airways", QH: "Bamboo Airways", SQ: "Singapore Airlines", TR: "Scoot", MH: "Malaysia Airlines",
  D7: "AirAsia X", AK: "AirAsia", OD: "Batik Air Malaysia", GA: "Garuda Indonesia", PR: "Philippine Airlines",
  "5J": "Cebu Pacific", Z2: "Philippines AirAsia", KR: "Cambodia Airways", QV: "Lao Airlines", BI: "Royal Brunei",
  AI: "Air India", UL: "SriLankan Airlines", KC: "Air Astana", HY: "Uzbekistan Airways",
  EK: "Emirates", EY: "Etihad Airways", QR: "Qatar Airways", SV: "Saudia", KU: "Kuwait Airways", WY: "Oman Air", LY: "El Al",
  TK: "Turkish Airlines", ET: "Ethiopian Airlines", KQ: "Kenya Airways", WB: "RwandAir", MS: "EgyptAir",
  AF: "Air France", KL: "KLM", LH: "Lufthansa", BA: "British Airways", VS: "Virgin Atlantic", AY: "Finnair", SK: "SAS",
  LO: "LOT Polish Airlines", TP: "TAP Air Portugal", LX: "SWISS", OS: "Austrian", AZ: "ITA Airways", IB: "Iberia", OK: "Czech Airlines",
  DL: "Delta Air Lines", UA: "United Airlines", AA: "American Airlines", AS: "Alaska Airlines", HA: "Hawaiian Airlines",
  AC: "Air Canada", WS: "WestJet", AM: "Aeromexico", CM: "Copa Airlines", LA: "LATAM",
  QF: "Qantas", JQ: "Jetstar", VA: "Virgin Australia", NZ: "Air New Zealand", TN: "Air Tahiti Nui",
};

/** 편명에서 항공사 코드(앞 두 글자)를 뗀다. */
export function airlineCode(flightNo: string): string {
  return flightNo.slice(0, 2).toUpperCase();
}

/** 화면 언어에 맞는 항공사 이름. 영어 화면에서 이름을 모르면 코드를 보여 준다. */
export function airlineLabel(lang: "ko" | "en", f: { flightNo: string; airline: string }): string {
  if (lang !== "en") return f.airline;
  const code = airlineCode(f.flightNo);
  return AIRLINE[code] ?? code;
}
