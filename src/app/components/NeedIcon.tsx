import {
  AArrowUp,
  Accessibility,
  Armchair,
  ArrowUpDown,
  Baby,
  BellRing,
  Footprints,
  HandHelping,
  HandHeart,
  HeartPulse,
  Hourglass,
  Image as ImageIcon,
  Leaf,
  MessageCircle,
  PersonStanding,
  Sofa,
  Toilet,
  UserCheck,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import type { FacilityKind } from "@/lib/airport";

// 선택 항목마다 붙이는 그림. 제안서의 화면 원칙 "모든 선택지에 글과 그림을 함께 둔다"를 지킨다.
// 글을 읽기 어려운 사람도 그림으로 항목을 구분할 수 있다.
const BY_CODE: Record<string, LucideIcon> = {
  gd_large: AArrowUp,
  gd_voice: Volume2,
  gd_picture: ImageIcon,
  gd_easy: MessageCircle,
  mov_wheelchair_own: Accessibility,
  mov_wheelchair_need: HandHelping,
  mov_no_stairs: ArrowUpDown,
  mov_need_rest: Footprints,
  mov_no_standing: Hourglass,
  fac_restroom: Toilet,
  fac_nursing: Baby,
  fac_rest: Armchair,
  fac_lounge: Sofa,
  fac_calm: Leaf,
  stf_call: BellRing,
  stf_self: UserCheck,
  // 증빙서류를 고르는 데 쓰는 대상(서버에 보내지 않는다).
  tg_elderly: PersonStanding,
  tg_infant: Baby,
  tg_disabled: HandHeart,
  tg_pregnant: HeartPulse,
};

const BY_FACILITY: Record<FacilityKind, LucideIcon> = {
  restroom: Toilet,
  nursing: Baby,
  rest: Armchair,
  lounge: Sofa,
  calm: Leaf,
  wheelchair: Accessibility,
};

export function NeedIcon({ code, size = 24 }: { code: string; size?: number }) {
  const Icon = BY_CODE[code] ?? Accessibility;
  return <Icon size={size} aria-hidden="true" />;
}

export function FacilityIcon({ kind, size = 24 }: { kind: FacilityKind; size?: number }) {
  const Icon = BY_FACILITY[kind];
  return <Icon size={size} aria-hidden="true" />;
}
