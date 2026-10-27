/** Service-specific work orders. Shared definitions; no credentials or hardware claims. */
export interface TaskField {
  id: string;
  label: string;
  en: string;
  placeholder?: string;
  placeholderEn?: string;
  legacy?: boolean;
  required?: boolean;
  type?: "text" | "datetime-local";
  options?: { value: string; label: string; en: string }[];
}
export interface ServiceTask {
  id: string;
  topic: string;
  label: string;
  en: string;
  fields: TaskField[];
}
const item: TaskField = {
  id: "item",
  label: "물품 종류",
  en: "Item type",
  required: true,
  options: [
    { value: "phone", label: "휴대전화·전자기기", en: "Phone / electronics" },
    { value: "wallet", label: "지갑·카드", en: "Wallet / cards" },
    { value: "bag", label: "가방·의류", en: "Bags / clothing" },
    { value: "document", label: "여권·서류", en: "Passport / documents" },
    { value: "other", label: "기타 물품", en: "Other item" },
  ],
};
const reportFields: TaskField[] = [
  {
    id: "reportArea",
    label: "터미널",
    en: "Terminal",
    legacy: true,
    options: [
      { value: "T1", label: "제1터미널", en: "Terminal 1" },
      { value: "CONCOURSE", label: "탑승동", en: "Concourse" },
      { value: "T2", label: "제2터미널", en: "Terminal 2" },
    ],
  },
  {
    id: "reportLevel",
    label: "층",
    en: "Floor",
    legacy: true,
    options: [
      { value: "B1", label: "지하 1층", en: "B1" },
      ...["1", "2", "3", "4", "5"].map((n) => ({
        value: n,
        label: n + "층",
        en: n + "F",
      })),
    ],
  },
  {
    id: "reportLocation",
    label: "시설 상세 위치",
    en: "Facility location",
    legacy: true,
  },
];
export const SERVICE_TASKS: ServiceTask[] = [
  {
    id: "mobility-escort",
    topic: "mobility",
    label: "이동 동행",
    en: "Mobility escort",
    fields: [],
  },
  {
    id: "mobility-wheelchair",
    topic: "mobility",
    label: "휠체어 지원",
    en: "Wheelchair assistance",
    fields: [],
  },
  {
    id: "mobility-vehicle",
    topic: "mobility",
    label: "교통약자 차량 지원",
    en: "Accessible vehicle",
    fields: [],
  },
  {
    id: "robot-visit",
    topic: "robot",
    label: "안내로봇 호출",
    en: "Request a guide robot",
    fields: [],
  },
  {
    id: "guidance-person",
    topic: "guidance",
    label: "현장 안내 지원",
    en: "On-site guidance",
    fields: [
      {
        id: "purpose",
        label: "안내받을 내용",
        en: "What do you need help with?",
      },
    ],
  },
  {
    id: "cleaning",
    topic: "facility",
    label: "청결·청소 요청",
    en: "Cleaning request",
    fields: [
      {
        id: "facility",
        label: "시설 이름",
        en: "Facility name",
        placeholder: "예: 남자화장실 (위치는 다음 단계에서 선택)",
        placeholderEn: "e.g. Men's restroom (select location next)",
        required: true,
      },
      { id: "issue", label: "불편한 내용", en: "Issue", required: true },
      ...reportFields,
    ],
  },
  // 피드백: 이용 도움(쓰기 어려운 기기)과 점검(고장·파손·안전 위험)을 나눈다. 예전 id(facility-access)는 이용 도움으로 남긴다.
  {
    id: "facility-access",
    topic: "facility",
    label: "시설 이용 도움 요청",
    en: "Help using a facility",
    fields: [
      {
        id: "facility",
        label: "시설 이름",
        en: "Facility name",
        placeholder: "예: 무인 발권기, 엘리베이터 (위치는 다음 단계에서 선택)",
        placeholderEn: "e.g. Self-service kiosk, lift (select location next)",
        required: true,
      },
      {
        id: "issue",
        label: "이용이 어려운 점",
        en: "What is hard to use",
        placeholder: "예: 버튼이 높아 누르기 어려워요",
        placeholderEn: "e.g. The buttons are too high to reach",
        required: true,
      },
      ...reportFields,
    ],
  },
  {
    id: "facility-inspection",
    topic: "facility",
    label: "시설 점검 요청",
    en: "Facility inspection",
    fields: [
      {
        id: "facility",
        label: "시설 이름",
        en: "Facility name",
        placeholder: "예: 에스컬레이터, 자동문 (위치는 다음 단계에서 선택)",
        placeholderEn: "e.g. Escalator, automatic door (select location next)",
        required: true,
      },
      {
        id: "problem",
        label: "문제 종류",
        en: "Type of problem",
        required: true,
        options: [
          { value: "broken", label: "고장", en: "Out of order" },
          { value: "damaged", label: "파손", en: "Damaged" },
          { value: "hazard", label: "안전 위험", en: "Safety hazard" },
        ],
      },
      {
        id: "issue",
        label: "상세 내용",
        en: "Details",
        placeholder: "예: 바닥 타일이 깨져 걸려 넘어질 수 있어요",
        placeholderEn: "e.g. A broken floor tile is a trip hazard",
        required: true,
      },
      ...reportFields,
    ],
  },
  {
    id: "parking-help",
    topic: "traffic",
    label: "주차장 현장 지원",
    en: "Car park assistance",
    fields: [
      {
        id: "zone",
        label: "주차 구역·층",
        en: "Parking zone / level",
        required: true,
      },
      {
        id: "issue",
        label: "필요한 지원",
        en: "Assistance needed",
        legacy: true,
      },
    ],
  },
  {
    id: "taxi-help",
    topic: "traffic",
    label: "택시 승차 지원",
    en: "Taxi boarding assistance",
    fields: [
      {
        id: "destination",
        label: "목적지 지역 · 선택",
        en: "Destination area · optional",
      },
    ],
  },
  {
    id: "bus-help",
    topic: "traffic",
    label: "버스·셔틀 이용 지원",
    en: "Bus / shuttle assistance",
    fields: [
      {
        id: "route",
        label: "이용할 노선·목적지",
        en: "Route / destination",
        required: true,
      },
    ],
  },
  {
    id: "lost-item",
    topic: "lost-property",
    label: "분실 신고",
    en: "Report a lost item",
    fields: [
      item,
      {
        id: "appearance",
        label: "색상·물품 특징",
        en: "Colour / identifying features",
        required: true,
      },
      {
        id: "eventTime",
        label: "마지막으로 본 시각 · 한국 시간",
        en: "Last seen · Korea time",
        type: "datetime-local",
        required: true,
      },
    ],
  },
  {
    id: "found-item",
    topic: "lost-property",
    label: "습득 신고·인계 요청",
    en: "Found item / collection",
    fields: [
      item,
      {
        id: "appearance",
        label: "색상·물품 특징",
        en: "Colour / identifying features",
        required: true,
      },
      {
        id: "eventTime",
        label: "습득한 시각 · 한국 시간",
        en: "Found at · Korea time",
        type: "datetime-local",
        required: true,
      },
    ],
  },
  {
    id: "other-request",
    topic: "other",
    label: "기타 업무 요청",
    en: "Other service request",
    fields: [
      {
        id: "purpose",
        label: "요청할 업무",
        en: "What needs to be done?",
        required: true,
      },
    ],
  },
];
export interface ServiceDetails {
  task: string;
  fields: Record<string, string>;
}
export const taskOf = (id: unknown) => SERVICE_TASKS.find((t) => t.id === id);
export const tasksFor = (topic: unknown) =>
  SERVICE_TASKS.filter((t) => t.topic === topic);
export function parseServiceDetails(
  value: unknown,
  topic: unknown,
  now: Date,
): ServiceDetails | string {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "서비스 내용을 확인해 주세요";
  const v = value as Record<string, unknown>,
    task = taskOf(v.task);
  if (!task || task.topic !== topic)
    return "서비스와 처리 유형이 일치하지 않습니다";
  if (!v.fields || typeof v.fields !== "object" || Array.isArray(v.fields))
    return "서비스 입력 항목을 확인해 주세요";
  const fields: Record<string, string> = {};
  for (const f of task.fields) {
    const raw = (v.fields as Record<string, unknown>)[f.id];
    if (raw !== undefined && typeof raw !== "string")
      return `${f.label}을 확인해 주세요`;
    const text = (raw as string | undefined)?.trim() ?? "";
    if (f.required && !text) return `${f.label}을 입력해 주세요`;
    if (text.length > 120 || text.includes(String.fromCharCode(0)))
      return `${f.label}은 120자 이내로 입력해 주세요`;
    if (text && f.options && !f.options.some((o) => o.value === text))
      return `${f.label}을 다시 선택해 주세요`;
    if (text && f.type === "datetime-local") {
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ||
        !Number.isFinite(Date.parse(text + "+09:00")) ||
        new Date(Date.parse(text + "+09:00") + 9 * 3600000)
          .toISOString()
          .slice(0, 16) !== text ||
        Date.parse(text + "+09:00") > now.getTime() + 300000
      )
        return "시각은 한국 시간 기준의 현재 또는 과거로 입력해 주세요";
    }
    if (text) fields[f.id] = text;
  }
  if (
    Object.keys(v).some((k) => !["task", "fields"].includes(k)) ||
    Object.keys(v.fields).some((k) => !task.fields.some((f) => f.id === k))
  )
    return "허용되지 않은 서비스 입력 항목입니다";
  return { task: task.id, fields };
}
export function serviceDetailsLines(
  details: ServiceDetails,
  lang: "ko" | "en" = "ko",
) {
  const t = taskOf(details.task);
  return (
    t?.fields
      .filter((f) => !f.id.startsWith("report"))
      .flatMap((f) =>
        details.fields[f.id]
          ? [
              {
                label: lang === "en" ? f.en : f.label,
                value:
                  f.options?.find((o) => o.value === details.fields[f.id])?.[
                    lang === "en" ? "en" : "label"
                  ] ?? details.fields[f.id],
              },
            ]
          : [],
      ) ?? []
  );
}
