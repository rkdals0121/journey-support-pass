import { describe, expect, it } from "vitest";
import { ITEMS } from "@/lib/catalog";
import { textOf } from "@/lib/i18n";
import { formalKo, speechText } from "@/lib/speech-text";

// 해요체 끝말. 소리 안내에 이것이 남으면 안 된다. 「~할까요?」는 안내 방송에서도 쓰는 정중한 물음이라 그대로 둔다.
const CASUAL = /(어요|아요|해요|돼요|세요|게요|래요|에요|예요|나요|가요|써요|워요|려요|와요|봐요|줘요|군요)(?=$|[\s.,!?」”)])/;

/** 문구 묶음에서 한국어 글을 모두 꺼낸다. 함수로 된 문구는 흔한 값을 넣어 만든다. */
function koStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    try {
      return koStrings((value as (...a: unknown[]) => unknown)(3, 5, 112, "walk"));
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.flatMap(koStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(koStrings);
  return [];
}

describe("소리 안내 말투 (피드백 1)", () => {
  it("해요체를 안내 방송 말투로 바꾼다", () => {
    expect(formalKo("여러 개 골라도 돼요.")).toBe("여러 개 골라도 됩니다.");
    expect(formalKo("어떤 점이 불편하세요?")).toBe("어떤 점이 불편하십니까?");
    expect(formalKo("큰 글씨로 보여주세요")).toBe("큰 글씨로 보여주십시오");
    expect(formalKo("휠체어를 빌릴래요")).toBe("휠체어를 빌리겠습니다");
    expect(formalKo("걷다가 힘들면 그때 부를래요")).toBe("걷다가 힘들면 그때 부르겠습니다");
    expect(formalKo("제가 필요할 때 부를게요")).toBe("제가 필요할 때 부르겠습니다");
    expect(formalKo("세 가지만 더 여쭐게요")).toBe("세 가지만 더 여쭈겠습니다");
    expect(formalKo("계단과 에스컬레이터는 어려워요")).toBe("계단과 에스컬레이터는 어렵습니다");
    expect(formalKo("다 고르셨어요. 고맙습니다.")).toBe("다 고르셨습니다. 고맙습니다.");
    expect(formalKo("보통이에요")).toBe("보통입니다");
    expect(formalKo("함께 가시는 분이 있나요?")).toBe("함께 가시는 분이 있습니까?");
    expect(formalKo("언제 떠나나요?")).toBe("언제 떠납니까?");
    expect(formalKo("어느 항공사인가요?")).toBe("어느 항공사입니까?");
    expect(formalKo("왔군요! 여행을 도와드릴게요.")).toBe("어서 오십시오. 여행을 도와드리겠습니다.");
    expect(formalKo("탑승권을 스캔하여 저를 깨워 주세요!")).toBe("탑승권을 스캔하여 저를 깨워 주십시오.");
  });

  it("이미 격식 있는 말과 낱말 안의 '요'는 건드리지 않는다", () => {
    expect(formalKo("탑승구가 112번에서 115번으로 바뀌었습니다.")).toBe("탑승구가 112번에서 115번으로 바뀌었습니다.");
    expect(formalKo("수유실 · 기저귀 갈 곳, 요금 없음")).toBe("수유실 · 기저귀 갈 곳, 요금 없음");
    expect(formalKo("필요 없음")).toBe("필요 없음");
  });

  it("영어는 그대로 읽는다", () => {
    expect(speechText("Choose all that apply!", "en")).toBe("Choose all that apply!");
  });

  it("여객 화면의 한국어 문구와 선택 항목은 소리로 읽을 때 해요체가 남지 않는다", () => {
    const all = [
      ...koStrings(textOf("ko")),
      ...koStrings(textOf("ko", true)),
      ...ITEMS.map((i) => i.label),
    ];
    const left = all.map(formalKo).filter((s) => CASUAL.test(s));
    expect(left).toEqual([]);
  });
});
