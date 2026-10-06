import {
  Accessibility,
  Armchair,
  ArrowUpDown,
  Baby,
  EarOff,
  EyeOff,
  Footprints,
  Glasses,
  HandHelping,
  Heart,
  Hourglass,
  MessageSquareText,
  Signpost,
  Smile,
  Timer,
  Users,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import type { Group } from "@/lib/catalog";

// 선택 항목마다 붙이는 그림. 글을 읽기 어려운 사람도 항목을 구분할 수 있게 돕는다.
const BY_CODE: Record<string, LucideIcon> = {
  cat_disability: Accessibility,
  cat_senior: Glasses,
  cat_pregnant: Heart,
  cat_infant: Baby,
  cat_child: Smile,
  mov_wheelchair_own: Accessibility,
  mov_wheelchair_need: Accessibility,
  mov_no_stairs: ArrowUpDown,
  mov_need_rest: Armchair,
  mov_no_standing: Hourglass,
  mov_escort: HandHelping,
  com_hearing: EarOff,
  com_vision: EyeOff,
  com_written: MessageSquareText,
  com_slow: Timer,
  com_wayfinding: Signpost,
  env_quiet: VolumeX,
  acc_stroller: Baby,
  acc_companion: Users,
};

export const GROUP_ICON: Record<Group, LucideIcon> = {
  category: Users,
  move: Footprints,
  comm: MessageSquareText,
  env: VolumeX,
  accompany: Users,
};

export function NeedIcon({ code, size = 20 }: { code: string; size?: number }) {
  const Icon = BY_CODE[code] ?? Accessibility;
  return <Icon size={size} aria-hidden="true" />;
}
