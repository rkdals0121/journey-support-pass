import { AREA_LABEL, AREA_LABEL_EN, type ThemeId, THEMES, THEMES_EN } from "@/lib/stamp-book";
import type { Area } from "@/lib/airport";

export type StampLang = "ko" | "en";

const EN: Record<string, string> = {
  "도장을 하나 받았어요! 먼저 수첩을 준비해요.": "You found a stamp! Set up your notebook first.",
  "이 체크포인트는 지금 코스·경로에 없어요. 수첩 목록에 있는 체크포인트를 찾아봐요.": "This checkpoint is not on your course. Find one listed in your notebook.",
  "경로 설정": "Route settings",
  "탑승구 번호": "Gate number",
  "목록으로 고르기": "Choose from a list",
  "지금 있는 곳 · 출국심사를 마친 뒤": "Your location · after immigration",
  "지금 있는 곳 고르기": "Choose your location",
  "출국심사를 막 마쳤어요": "Just after immigration",
  "탑승 시각 · 한국시간 · 선택": "Boarding time · Korea time · optional",
  "다른 코스로 바꾸기": "Try another course",
  "스탬프북 QR이 아니에요. 체크포인트의 QR을 비춰 주세요.": "This is not a stamp-book QR code. Scan a checkpoint QR code.",
  "이름을 입력해요": "Name",
  "탑승구 번호 (필수)": "Gate",
  "꼬마 여행자": "Traveller",
  "스탬프북 나가기": "Leave the stamp book",
  "서비스로 돌아가기": "Back to services",
  "완료 ·": "complete ·",
  "수첩 이어 보기": "Continue my notebook",
  "모은 도장과 사진을 모두 지우고 처음부터 할까요?": "Delete all collected stamps and photos and start again?",
  "처음부터 다시 하기": "Start again",
  "수첩 메뉴": "Notebook menu",
  "내 수첩": "My book",
  "테마 바꾸기": "Themes",
  "사용 방식": "Collection mode",
  "놀이형": "Explore",
  "경로형": "On the way",
  "탑승 정보 바꾸기": "Edit boarding details",
  "완성 보상 받으러 가기": "Get my reward",
  "QR 스캔하기": "Scan a QR code",
  "QR 스캔": "Scan a QR code",
  "QR 사진으로 찍기": "Read a QR photo",
  "카메라를 켜는 중이에요…": "Starting the camera…",
  "현재 구역의 체크포인트 QR을 비춰 주세요": "Scan a checkpoint QR code in this area",
  "읽었어요!": "Code read!",
  "카메라를 쓸 수 없어요. 아래에 QR 포스터의 고유번호를 눌러 주세요.": "Camera unavailable. Enter the unique code from the QR poster below.",
  "카메라 바꾸기": "Switch camera",
  "QR이 안 찍히면 QR 포스터 아래 고유번호(6자리)를 눌러요": "Cannot scan? Enter the 6-character code below the QR poster.",
  "예: 7KQ4MD": "e.g. 7KQ4MD",
  "찍기": "Collect",
  "수첩으로 돌아가기": "Back to my notebook",
  "이미 받은 도장이에요": "You already have this stamp",
  "현재 거점과 탑승구를 먼저 확인해 주세요.": "Check your location and gate first.",
  "필터 고르기": "Choose a photo filter",
  "사진 저장하기": "Save photo",
  "다시 찍기": "Retake photo",
  "사진 없이 인증 ID만 받기": "Get my ID without a photo",
  "내 수첩 보기": "View my notebook",
  "어떤 수첩으로": "Which notebook",
  "공항을 여행할까요?": "will you explore with?",
  "나중에 바꿔도 모은 도장은 그대로예요.": "Switch notebooks any time. Your stamps stay saved.",
  "내 수첩 열어 보기": "Open my notebook",
  "탐험 진행도": "Exploration progress",
  "도장 진행도": "Stamp progress",
  "비행 진행도": "Flight progress",
  "탑승구": "Gate",
  "탑승 시각": "Boarding time",
  "탑승 시각이에요": "It is time to board",
  "입력하지 않았어요": "Not entered",
  "탑승구 방향 거점": "Checkpoints towards your gate",
  "탑승구 위치: 인천국제공항 공식 지도": "Gate locations: Incheon Airport official map",
  "인증 ID": "Certificate ID",
  "탑승구 번호를 입력해 주세요.": "Enter your gate number.",
  "탑승 시각을 확인해 주세요.": "Check your boarding time.",
  "탑승 시각이 가까워요. 도장 수집 대신 탑승구로 바로 이동해 주세요.": "Boarding is soon. Stop collecting stamps and go straight to your gate.",
  "지금 있는 곳을 골라 주세요.": "Choose your current location.",
  "지금 있는 터미널과 탑승구의 터미널이 달라요. 탑승권의 터미널을 확인해 주세요.": "Your gate is in another terminal. Check the terminal on your boarding pass.",
  "탑승동에서는 제1여객터미널로 돌아갈 수 없어요.": "You cannot return to Terminal 1 from the Concourse.",
  "코스를 만들고 있어요.": "Preparing your course.",
  "서편": "West", "중앙": "Centre", "동편": "East",
  "탑승구 번호를 먼저 넣으면 그 터미널 지도가 나와요.": "Enter a gate number to see its terminal map.",
  "지도에서 지금 있는 곳 고르기": "Choose your location on the map",
  "지금 있는 곳 · 지도에서 고르기": "Your location · choose on the map",
  "터미널": "Terminal",
  "구역 나눠 보기": "View map sections",
  "전체": "All",
  "확대·축소": "Map zoom",
  "축소": "Zoom out", "확대": "Zoom in", "↑ 북": "↑ N",
  "체크포인트": "Checkpoint",
  "출국심사 출구": "Immigration exit",
  "탑승구 번호 · 지도 자료: 인천국제공항 공식 지도": "Gate number · Map: Incheon Airport official map",
  ", 여기 맞아요?": ", is this your location?",
  "여기 맞아요": "Yes, I am here",
  "다시 고르기": "Choose again",
  "지금 있는 곳:": "Your location:",
  "주변 탑승구 번호 표지판을 보고 그 번호 가까운 점을 눌러요. 방금 출국심사를 마쳤다면 ◆ 출구를 눌러요.": "Find a nearby gate number and select the closest point. Just passed immigration? Select a ◆ exit.",
  "나랑이 친구들 사이에서 활짝 웃어요!": "Smile with your Narangi friends!",
  "얼굴 인식을 준비하고 있어요…": "Preparing face detection…",
  "점선 동그라미에 얼굴을 맞춰 주세요": "Place your face inside the dotted circle",
  "좋아요! 찰칵 버튼을 눌러요": "Ready! Select Take photo",
  "얼굴이 화면에 보이게 해 주세요": "Keep your face in the frame",
  "필터를 입힌 카메라 화면": "Camera preview with a photo filter",
  "카메라를 켤 수 없어요.": "Camera unavailable.",
  "아래 「사진 고르기」로 찍어 주세요.": "Use Choose photo below.",
  "사진 만드는 중…": "Preparing your photo…",
  "찰칵! 찍기": "Take photo",
  "사진 고르기": "Choose photo",
  "돌아가기": "Back",
};

/** 저장 값과 수집 판정은 그대로 두고, 화면에 보이는 안내만 번역한다. */
export function stampText(lang: StampLang, value: string): string {
  if (lang === "ko") return value;
  const key = value.trim();
  if (EN[key]) return value.replace(key, EN[key]);
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^(.*?)번은 인천공항에 없는 탑승구예요\. 탑승권을 다시 확인해 주세요\.$/, m => `Gate ${m[1]} does not exist at Incheon Airport. Check your boarding pass.`],
    [/^이 체크포인트 근처예요 · (.+)$/, m => `Near a checkpoint · ${m[1]}`],
    [/^(.+)의 인증 사진$/, m => `Certificate photo of ${m[1]}`],
    [/^(.+)로 찍은 인증 사진$/, m => `Certificate photo with ${m[1]}`],
    [/^별 (\d+)개$/, m => `${m[1]} stars`],
    [/^(.+) 획득 완료 · $/, m => `${m[1]} collected · `],
    [/^ · (\d+)번 탑승구 근처$/, m => ` · near Gate ${m[1]}`],
    [/^ · 셔틀트레인$/, () => " · Shuttle Train"],
    [/^(.+) 지도\. 점을 누르면 지금 있는 곳으로 고를 수 있어요\.$/, m => `${m[1]} map. Select a point to choose your location.`],
  ];
  for (const [pattern, format] of patterns) {
    const match = value.match(pattern);
    if (match) return format(match);
  }
  return value;
}

export const stampCopy = (lang: StampLang) => (value: string) => stampText(lang, value);
export const themeFor = (id: ThemeId, lang: StampLang) => (lang === "en" ? THEMES_EN : THEMES)[id];
export const areaName = (area: Area, lang: StampLang) => (lang === "en" ? AREA_LABEL_EN : AREA_LABEL)[area];
export const exitName = (id: string, original: string, lang: StampLang) => lang === "en"
  ? `${id.startsWith("t1-") ? "Terminal 1" : "Terminal 2"} · Immigration exit ${id.split("-")[1]}` : original;
