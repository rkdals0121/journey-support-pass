// 소리 안내의 말투. 화면 글은 체크리스트대로 부드러운 말(해요체)을 쓰지만, 소리로 읽을 때는 공항 안내 방송처럼
// 격식 있는 말(합니다·하십시오)로 바꾼다(피드백 1: 음성 안내 말투가 구어체임).
// 화면 글을 그대로 받아 끝말만 바꾼다. 소리용 문구를 따로 두면 화면 글을 고칠 때 소리 글을 빠뜨리기 쉽다.
// 바꾸지 못한 끝말이 남지 않는지 tests/speech-text.test.ts 가 모든 한국어 문구로 확인한다.
// 이 파일은 브라우저에서도 읽는다. 서버 전용 코드를 가져오지 말 것.

const BASE = 0xac00;
const LAST = 0xd7a3;
const isSyllable = (c: string) => c.length === 1 && c.charCodeAt(0) >= BASE && c.charCodeAt(0) <= LAST;
/** 받침 번호(0 이면 받침 없음). ㄹ 은 8, ㅂ 은 17. */
const finalOf = (c: string) => (isSyllable(c) ? (c.charCodeAt(0) - BASE) % 28 : -1);
const withFinal = (c: string, f: number) => String.fromCharCode(c.charCodeAt(0) - finalOf(c) + f);
const L = 8;
const B = 17;

/** 받침 ㄹ 을 뗀다. 빌릴 → 빌리, 할 → 하. */
function dropL(stem: string): string {
  const last = stem.slice(-1);
  return finalOf(last) === L ? stem.slice(0, -1) + withFinal(last, 0) : stem;
}

/** 줄기에 -습니다/-ㅂ니다 를 붙인다. 있 → 있습니다, 가 → 갑니다. */
function formal(stem: string, ending: "다" | "까"): string {
  const last = stem.slice(-1);
  if (!isSyllable(last)) return stem + "습니" + ending;
  return finalOf(last) === 0 ? stem.slice(0, -1) + withFinal(last, B) + "니" + ending : stem + "습니" + ending;
}

// 줄기를 따로 알아야 하는 끝말. 긴 것부터 맞춘다. 값은 바꾼 말 전체다.
const WORDS: [string, string][] = [
  ["왔군요", "어서 오십시오"],
  ["괜찮아요", "괜찮습니다"],
  ["싶어요", "싶습니다"],
  ["어려워요", "어렵습니다"],
  ["드려요", "드립니다"],
  ["않아요", "않습니다"],
  ["맞아요", "맞습니다"],
  ["좋아요", "좋습니다"],
  ["많아요", "많습니다"],
  ["같아요", "같습니다"],
  ["있어요", "있습니다"],
  ["없어요", "없습니다"],
  ["몰라요", "모릅니다"],
  ["걸려요", "걸립니다"],
  ["돼요", "됩니다"],
  ["해요", "합니다"],
  ["써요", "씁니다"],
  ["가요", "갑니다"],
  ["와요", "옵니다"],
  ["봐요", "봅니다"],
  ["줘요", "줍니다"],
];

/** 한국어 소리 안내 글을 안내 방송 말투로 바꾼다. */
export function formalKo(text: string): string {
  let s = text;
  // 느낌표는 안내 방송에 맞지 않는다.
  s = s.replace(/!/g, ".");
  // -인가요? → -입니까?   (어느 항공사인가요?)
  s = s.replace(/인가요\?/g, "입니까?");
  // -세요? → -십니까?   -세요 → -십시오   (불편하세요? / 골라 주세요)
  s = s.replace(/([가-힣])세요\?/g, (_, c: string) => `${c}십니까?`);
  s = s.replace(/([가-힣])세요/g, (_, c: string) => `${c}십시오`);
  // -ㄹ게요 / -ㄹ래요 → -겠습니다   (부를게요, 빌릴래요, 따라갈래요)
  s = s.replace(/([가-힣]+)(게요|래요)(?=$|[\s.,?」”)])/g, (m, stem: string) => (finalOf(stem.slice(-1)) === L ? `${dropL(stem)}겠습니다` : m));
  // -었어요/-았어요/-였어요/-했어요/-셨어요/-됐어요/-겠어요 → -습니다   (반영했어요, 다 고르셨어요, 잘 모르겠어요)
  s = s.replace(/([가-힣]*[었았였했셨됐겠웠])어요/g, (_, stem: string) => `${stem}습니다`);
  // -이에요/-예요 → -입니다   (보통이에요, 내용이에요)
  s = s.replace(/([가-힣]+)(이에요|예요)/g, (_, stem: string) => `${stem}입니다`);
  // -나요(?) → -습니까/-ㅂ니까   (있나요?, 떠나나요?, 무엇을 받나요)
  s = s.replace(/([가-힣]+)나요(?=$|[\s.,?」”)])/g, (_, stem: string) => formal(stem, "까"));
  // 줄기를 따로 아는 끝말.
  s = s.replace(/([가-힣]*?)([가-힣]{1,3}요)(?=$|[\s.,?」”)])/g, (m, head: string, word: string) => {
    const hit = WORDS.find(([from]) => (head + word).endsWith(from));
    if (!hit) return m;
    const whole = head + word;
    return whole.slice(0, whole.length - hit[0].length) + hit[1];
  });
  return s;
}

/** 소리로 읽을 글. 한국어만 바꾸고 영어는 그대로 둔다. */
export function speechText(text: string, lang: "ko" | "en"): string {
  return lang === "ko" ? formalKo(text) : text;
}
