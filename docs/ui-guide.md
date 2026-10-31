# 화면 만들기 가이드 (UI 통일 · 한 화면 맞춤)

이 문서는 **화면을 새로 만들거나 고치는 모든 작업자와 AI**가 따라야 하는 실제 작업 기준이다.
`AGENTS.md`(공통 규칙)를 먼저 읽고, 화면 작업에서는 이 문서를 기준으로 삼는다. 둘이 다르면 `AGENTS.md`가 우선한다.

목표는 두 가지다.
1. **한 화면에 다 들어오게.** 어떤 기기에서든 스크롤을 최소로. 키오스크는 스크롤 0.
2. **통일된 틀, 보기 좋은 화면.** 모든 화면이 같은 부품·같은 간격·같은 끝선을 쓴다. 웹 첫 화면(`/`)이 기준 화면이다.

---

## 1. 기준 화면: 웹 첫 화면(`/`)
지금 가장 정돈된 화면은 웹 첫 화면이다. 새 화면은 이 화면의 부품을 그대로 가져다 쓴다.

| 부품 | 모양 | 있는 곳(예시) |
|---|---|---|
| 위쪽 바 | 둥근 바(pill), 노란 그라데이션 → 흰색, 그림자 1 | `site-bar.css` (`.public-header`, `.pretrip-header`, `.flow-bar`) |
| 소개 박스(hero) | 테두리 1px `--color-line`, 모서리 `--radius-medium`, `linear-gradient(110deg, var(--color-accent-soft), var(--color-surface) 72%)` | `passenger-layout.css` `.ph-hero` |
| 카드 | 흰 바탕 `--color-surface`, 테두리 1px `--color-line`, 모서리 `--radius-medium`, 안쪽 여백 `--space-4`~`--space-5` | `.ph-list .task-action` |
| 아이콘 칩 | 아이콘 둘레에 `--color-primary-faint` 바탕, 모서리 `--radius-medium`, 아이콘 색 `--color-primary` | `.task-action-icon` |
| 주요 버튼 | 딥그린 `--color-primary` 바탕, 흰 글자, 높이 3.5rem 이상 | `.btn-primary` |
| 강조 하나 | 해바라기 노랑 `--color-accent` 는 화면마다 딱 한 곳 | 도움 요청하기, 탑승구 번호판 |
| 아래쪽 바 | 위쪽 바와 같은 너비의 둥근 바, 그라데이션 없이 흰 단색 | `site-bar.css` `.airport-site .public-footer` |
| 하늘이 | 원 안의 하늘이(옅은 노랑 원 + 점선 궤도) | `.ph-hero-art`, `haneuli.css` `.hw-art` |

**만들지 말 것**: 박스 안의 박스(카드 속 카드), 화면마다 다른 둥근 정도·그림자·테두리 두께, 회색 덩어리 배경, 설명 문단이 여러 줄인 화면.

## 2. 끝선(오와열)
- **모든 덩어리의 왼쪽·오른쪽 끝은 위쪽 바와 같다.** 너비 공식은 하나다.
  ```css
  --w: min(var(--site-bar-width), calc(100vw - 2 * var(--site-bar-gutter)));
  width: var(--w);
  margin-inline: calc((100% - var(--w)) / 2); /* 감싼 칸이 좁아도 바와 같은 끝선으로 */
  ```
- 나란한 카드는 **높이가 같다**(`grid-auto-rows: 1fr` 또는 `align-items: stretch`).
- 두 칸 배치에서 왼쪽 칸과 오른쪽 칸의 **윗선·아랫선이 같다**. 버튼은 칸 맨 아래(`margin-top: auto`)에 둔다.
- 간격은 한 화면에서 한 값으로: 덩어리 사이 `--space-4`, 카드 안 `--space-4`~`--space-5`.

## 3. 한 화면 맞춤 (스크롤 최소)
### 기기별 목표
| 기기 | 브라우저 안쪽 크기 | 목표 |
|---|---|---|
| 가로 키오스크 55" (16:9) | 1920×1080 | **스크롤 0** |
| 장애인 키오스크 19.5" (4:3) | 1024×768 | **스크롤 0** |
| 안내로봇 27" (세로) | 1080×1920 | **스크롤 0** |
| 노트북 | 1280×633, 1333×750, 1366×657, 1920×937 | 첫 화면·짧은 화면은 **스크롤 0**, 긴 목록만 예외 |
| 태블릿 | 768×1024 | 스크롤 최소 |
| 휴대전화 | 390×844, 320×640 | 한 줄 배치, 스크롤 허용(옆 넘침은 0) |

키오스크(`html[data-kiosk]`)는 글자 기준(rem)이 화면 크기에 따라 커진다(1920 폭에서 1rem ≈ 26px). 일반 노트북에서 맞다고 키오스크에서 맞는 게 아니다. **반드시 키오스크 크기에서 따로 잰다.**

### 높이를 맞추는 방법
1. 화면을 **세로 격자**로 짠다. 고정 높이 줄(바, 제목) + 남는 높이를 나눠 쓰는 줄(`minmax(0, 1fr)`).
   ```css
   .page { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: var(--space-4);
           min-height: calc(100dvh - var(--site-bar-height) - <위아래 여백 합>); }
   ```
2. 그림·카메라·하늘이 크기는 **화면 높이에 비례**: `width: clamp(8rem, 20dvh, 13rem)`, `max-height: 20dvh`.
3. 그래도 넘치면 줄이는 순서: 여백 → 그림 크기 → 보조 글(설명 문단) 삭제 → 글자 크기 한 단계. **기능(버튼)을 빼서 맞추지 않는다.**
4. 낮은 화면은 `@media (max-height: 700px)`에서 여백·단추 높이부터 줄인다.
5. 화면 비율별 배치: 가로 넓은 화면은 칸을 나란히, `(orientation: portrait)`는 위→아래, 4:3(`(orientation: landscape) and (max-width: 1100px)`)은 같은 틀에서 크기만 줄인다.

### 글은 최소로
- 화면마다 **제목 한 줄 + (필요하면) 한 줄 설명**. 카드는 **이름 + 짧은 보조 한 줄**.
- 설명 문단·주의 문구를 여러 줄 쓰지 않는다. 꼭 필요한 안내는 하늘이 말풍선 한 줄로.
- 키오스크·로봇 화면은 특히 글을 줄인다(사용자 피드백: 「텍스트가 너무 많다」).

## 4. 지켜야 할 기능 (빼면 안 되는 것)
- 키오스크 「도움 요청하기」(`.call-btn`): 모든 키오스크 화면에서 같은 자리(위쪽 바 안쪽 오른쪽 끝), 같은 크기.
- 「소리로 안내 듣기」(`.listen-start`): 소리 안내를 쓰는 분이 탑승권을 대기 전에도 켤 수 있어야 한다. 키오스크 첫 화면에서 빼지 않는다.
- 글자 크기 설정(`--scale`, 0.9~1.5배): 1.5배에서도 잘리거나 겹치지 않아야 한다.
- 누르는 곳: 휴대전화 44px, 키오스크 64px 이상.
- e2e 가 쓰는 클래스·문구(`AGENTS.md` 5절)를 바꾸면 `scripts/e2e.ts`도 같이 고친다.

## 5. CSS 작성 규칙 (덧칠 금지)
- 색·글자·간격·모서리·움직임은 `tokens.css`의 `var(--*)`만. 색 코드(#…) 금지.
- 고칠 규칙이 있는 **원래 파일**에서 고친다. `layout.tsx` 끝에 새 CSS 파일 추가 금지. 같은 선택자를 두 파일에서 정하지 않는다.
- `!important` 금지. 다른 규칙에 지면 그 규칙을 고친다.
  - 예: 키오스크에서는 `devices.css`의 `html[data-kiosk] .flow-body h1`이 제목 크기를 줄인다. 키오스크 화면의 큰 제목은 `html[data-kiosk] .그화면 h1`로 같은 무게의 선택자를 쓴다.
- 고정 px 너비·높이 금지(선 1px, `--site-bar-width` 같은 기존 토큰은 예외). rem·%·dvh·`clamp()`.
- `overflow: hidden/clip`으로 넘친 걸 숨기지 않는다. 넘치면 배치를 고친다.
- JSX 문자열 안 줄바꿈은 `\n`(실제 줄바꿈 금지, 빌드가 깨진다). 화면 글에 맨 `"` 금지.

## 6. 확인 방법 (PR 올리기 전 필수)
### 화면 크기별 실측
개발 서버(`npm run dev`)를 띄우고, 바꾼 화면을 아래 크기로 열어 브라우저 개발자 도구 콘솔에서 잰다.
```js
// 1) 세로 스크롤: doc 가 vh 와 같아야 한다(키오스크·노트북 첫 화면)
// 2) 옆 넘침: sw 는 0 이하
// 3) 끝선: 바와 덩어리의 left/right 가 같아야 한다
document.getAnimations().forEach(a => a.finish()); // 화면 전환 움직임을 끝낸 뒤 잰다
const R = s => { const b = document.querySelector(s)?.getBoundingClientRect(); return b && [Math.round(b.left), Math.round(b.right)]; };
JSON.stringify({ vh: innerHeight, doc: document.documentElement.scrollHeight,
  sw: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  bar: R('.flow-bar, .public-header, .pretrip-header'), main: R('main > *') });
```
- 키오스크 화면은 먼저 키오스크로 설치해야 열린다(`/kiosk`에서 시연 코드). 설치 쿠키가 있으면 `/visits` 같은 주소가 `/kiosk/visits`로 바뀐다.
- 화면 전환 움직임(FlowShell 의 나타나기)이 끝나기 전에 재면 6~7px 넘친 것처럼 보인다. 위 코드처럼 움직임을 끝낸 뒤 잰다.

### 자동 점검
```bash
npx tsc --noEmit -p .
npx eslint src
npx vitest run
npx tsx scripts/layout-check.ts   # 132개 화면, 문제 0개가 목표
npx tsx scripts/e2e.ts            # 화면 흐름·문구를 바꿨으면 반드시 (30~40분, 자정을 넘기지 않게)
```
- e2e 가 도는 동안 파일을 고치지 않는다(화면이 다시 불러와져 엉뚱한 곳에서 멈춘다).
- 「점검이 자정을 넘김」「같은 날 앞 회차 기록이 쌓임」으로 통계 점검이 실패할 수 있다. 실패 내용을 보고 판단하고, 그 사실을 PR 에 적는다.

### 화면 그림
PR 에 **바꾸기 전 / 바꾼 뒤** 그림을 붙인다: 휴대전화 390, 노트북 1333×750, (키오스크면) 1920×1080·1024×768·1080×1920.

## 7. 화면 목록과 담당 틀
| 묶음 | 주소 | 틀 |
|---|---|---|
| 여객 웹 | `/`, `/services`, `/services/desks`, `/services/lost-property`, `/help`, `/navigate`, `/requests`, `/visits`, `/points`, `/stamp`, `/check` | 위쪽 바 + 소개 박스 + 카드 격자 + 아래쪽 바 |
| 사전등록 | `/prepare`, `/prepare/booking`, `/register` | 위쪽 바 + 두 박스 / 단계 흐름(`.flow-pretrip`) |
| 여객 패스 | `/p/[token]`, `/p/[token]/help` | 위쪽 바 + 카드 |
| 키오스크 | `/kiosk`, `/kiosk/guide`, `/kiosk/entry`, `/kiosk/visits` | 위쪽 바(도움 요청하기 포함) + 소개 박스 + 같은 크기 카드, 스크롤 0 |
| 기기 소개 | `/devices`, `/devices/[device]` | 여객 웹과 같은 틀 |
| 직원 | `/staff/*` | 직원 틀(딥그린 메뉴 + 미색 작업 면). 표·목록은 같은 여백·같은 상태 표시 |
| 시연 | `/demo/*` | 여객 웹과 같은 틀 |

## 8. 작업 단위
- PR 하나에 **화면 묶음 하나**(위 표의 한 줄). 여러 묶음을 한 PR 에 섞지 않는다.
- PR 설명에: 바꾼 화면, 크기별 실측 결과(doc/vh, 끝선), 점검 결과, 바꾸기 전/후 그림, 남은 문제.
- 병합은 저장소 관리자가 한다. `main`에 바로 올리지 않는다.
