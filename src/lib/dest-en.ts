/**
 * 도착 공항 코드 → 영어 도시 이름. 운항 정보에는 도착지 이름이 한국어로만 온다.
 * 영어 화면에서 "JFK" 같은 코드만 보이지 않도록, 인천에서 자주 가는 곳을 적어 두었다.
 * 여기에 없는 공항은 코드를 그대로 보여 준다.
 */
const CITY: Record<string, string> = {
  // 일본
  NRT: "Tokyo Narita", HND: "Tokyo Haneda", KIX: "Osaka", NGO: "Nagoya", FUK: "Fukuoka", CTS: "Sapporo", OKA: "Okinawa",
  KOJ: "Kagoshima", KMJ: "Kumamoto", OIT: "Oita", NGS: "Nagasaki", HIJ: "Hiroshima", TAK: "Takamatsu", MYJ: "Matsuyama",
  KMQ: "Komatsu", TOY: "Toyama", KIJ: "Niigata", SDJ: "Sendai", AOJ: "Aomori", FSZ: "Shizuoka", OKJ: "Okayama",
  YGJ: "Yonago", KKJ: "Kitakyushu", HSG: "Saga", KMI: "Miyazaki", ISG: "Ishigaki", SHM: "Shirahama", TKS: "Tokushima",
  UBJ: "Ube", AKJ: "Asahikawa", HKD: "Hakodate", MMY: "Miyako", SHI: "Shimojishima", IBR: "Ibaraki", KCZ: "Kochi",
  UKB: "Kobe", PUS: "Busan", TAE: "Daegu", CJU: "Jeju",
  // 중국, 홍콩, 마카오, 대만, 몽골
  LJG: "Lijiang", WDS: "Shiyan", YTY: "Yangzhou", WNZ: "Wenzhou", YIH: "Yichang", JMU: "Jiamusi", TXN: "Huangshan",
  BSZ: "Bishkek", TBS: "Tbilisi",
  PEK: "Beijing", PKX: "Beijing Daxing", PVG: "Shanghai Pudong", SHA: "Shanghai Hongqiao", CAN: "Guangzhou", SZX: "Shenzhen",
  TAO: "Qingdao", DLC: "Dalian", SHE: "Shenyang", TSN: "Tianjin", HGH: "Hangzhou", NKG: "Nanjing", XIY: "Xi'an",
  CTU: "Chengdu", TFU: "Chengdu Tianfu", CKG: "Chongqing", WUH: "Wuhan", CSX: "Changsha", XMN: "Xiamen", KMG: "Kunming",
  HRB: "Harbin", CGQ: "Changchun", YNJ: "Yanji", YNT: "Yantai", WEH: "Weihai", TNA: "Jinan", CGO: "Zhengzhou",
  HFE: "Hefei", NGB: "Ningbo", WUX: "Wuxi", YNZ: "Yancheng", SYX: "Sanya", HAK: "Haikou", KWL: "Guilin", DYG: "Zhangjiajie",
  MDG: "Mudanjiang", URC: "Urumqi", TYN: "Taiyuan", SJW: "Shijiazhuang", KWE: "Guiyang", NNG: "Nanning", FOC: "Fuzhou",
  HKG: "Hong Kong", MFM: "Macau", TPE: "Taipei", TSA: "Taipei Songshan", KHH: "Kaohsiung", RMQ: "Taichung", UBN: "Ulaanbaatar",
  // 동남아시아
  BKK: "Bangkok", DMK: "Bangkok Don Mueang", CNX: "Chiang Mai", HKT: "Phuket", SGN: "Ho Chi Minh City", HAN: "Hanoi",
  DAD: "Da Nang", CXR: "Nha Trang", PQC: "Phu Quoc", HPH: "Hai Phong", DLI: "Da Lat", MNL: "Manila", CEB: "Cebu",
  CRK: "Clark", KLO: "Kalibo", TAG: "Bohol", PPS: "Puerto Princesa", SIN: "Singapore", KUL: "Kuala Lumpur",
  BKI: "Kota Kinabalu", JHB: "Johor Bahru", CGK: "Jakarta", DPS: "Bali", MDC: "Manado", BTH: "Batam", PNH: "Phnom Penh",
  KTI: "Phnom Penh", REP: "Siem Reap", SAI: "Siem Reap", VTE: "Vientiane", LPQ: "Luang Prabang", RGN: "Yangon", BWN: "Brunei",
  // 남아시아, 중앙아시아, 중동
  DEL: "Delhi", BOM: "Mumbai", BLR: "Bengaluru", MAA: "Chennai", KTM: "Kathmandu", DAC: "Dhaka", CMB: "Colombo", MLE: "Male",
  TAS: "Tashkent", ALA: "Almaty", NQZ: "Astana", FRU: "Bishkek", DXB: "Dubai", AUH: "Abu Dhabi", DOH: "Doha", RUH: "Riyadh",
  JED: "Jeddah", TLV: "Tel Aviv", IST: "Istanbul", ADD: "Addis Ababa", CAI: "Cairo",
  // 유럽
  LHR: "London", CDG: "Paris", FRA: "Frankfurt", MUC: "Munich", AMS: "Amsterdam", FCO: "Rome", MXP: "Milan", VCE: "Venice",
  MAD: "Madrid", BCN: "Barcelona", LIS: "Lisbon", ZRH: "Zurich", VIE: "Vienna", PRG: "Prague", BUD: "Budapest",
  WAW: "Warsaw", WRO: "Wroclaw", HEL: "Helsinki", CPH: "Copenhagen", ARN: "Stockholm", OSL: "Oslo", ZAG: "Zagreb",
  ATH: "Athens", BRU: "Brussels",
  // 미주, 대양주
  JFK: "New York", EWR: "Newark", LAX: "Los Angeles", SFO: "San Francisco", SEA: "Seattle", ORD: "Chicago", DFW: "Dallas",
  ATL: "Atlanta", IAD: "Washington", BOS: "Boston", LAS: "Las Vegas", DTW: "Detroit", MSP: "Minneapolis", SLC: "Salt Lake City",
  HNL: "Honolulu", IAH: "Houston", YVR: "Vancouver", YYZ: "Toronto", YYC: "Calgary", MEX: "Mexico City", GUM: "Guam",
  SPN: "Saipan", ROR: "Palau", SYD: "Sydney", BNE: "Brisbane", MEL: "Melbourne", AKL: "Auckland",
};

/** 영어 화면에 쓸 도착지 이름. 아는 공항이면 도시 이름과 코드를 함께, 모르면 코드만. 코드도 없으면 받은 이름 그대로. */
export function destEn(destCode: string, destName: string): string {
  const code = destCode.trim().toUpperCase();
  if (!code) return destName;
  const city = CITY[code];
  return city ? `${city} (${code})` : code;
}

// 한 도시에 공항이 여럿일 때 붙는 공항 이름. 도시 목록에서는 떼고 보여 준다.
const AIRPORT_WORDS = / (Narita|Haneda|Pudong|Hongqiao|Daxing|Don Mueang|Songshan|Tianfu)$/;

/** 도시 목록에 쓸 영어 도시 이름. "Tokyo Narita" → "Tokyo". 모르는 공항이면 빈 글자. */
export function cityEn(destCode: string): string {
  const city = CITY[destCode.trim().toUpperCase()];
  return city ? city.replace(AIRPORT_WORDS, "") : "";
}

/** 화면 언어에 맞는 도착지 이름. */
export function destLabel(lang: "ko" | "en", f: { destCode: string; destName: string }): string {
  return lang === "en" ? destEn(f.destCode, f.destName) : f.destName;
}

/** 영어 도시 이름으로 공항 코드를 찾는다. 편명 대신 "tokyo"처럼 넣은 여객을 위해서다. 두 글자 이상이어야 한다. */
export function codesByCity(input: string): string[] {
  // 띄어쓰기와 기호는 빼고 견준다. "newyork" 도 "New York" 을 찾는다.
  const q = input.toLowerCase().replace(/[^a-z]/g, "");
  if (q.length < 3) return [];
  return Object.entries(CITY)
    .filter(([, city]) => city.toLowerCase().replace(/[^a-z]/g, "").startsWith(q))
    .map(([code]) => code);
}
