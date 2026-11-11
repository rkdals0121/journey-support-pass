# 박스 사이 간격 하나로 통일 (`--space-4`)

`/devices` 의 간격(바↔소개 박스, 소개 박스↔카드, 카드↔카드 모두 16px = `--space-4`)을 기준으로 삼아, 다른 화면에서 이 간격이 어긋난 곳을 자동으로 재고 고쳤다.

## 점검 방법
`scripts/layout-check.ts` 가 화면마다 **바깥 박스**(테두리나 배경이 있는 칸, 크기 160×64 이상)끼리의 간격을 잰다.
- 기준은 `--space-4`(1rem). 키오스크는 rem 이 커서 1920 폭에서 26px 이다.
- 휴대전화(폭 760px 이하)는 `--space-2` ~ `--space-4`, 낮은 화면(높이 700px 이하)은 `--space-1` ~ `--space-4` 까지 허용한다(가이드의 「여백부터 줄인다」).
- 두 박스 사이에 글자·그림·단추가 있으면(제목, 진행 표시 줄) 구역을 나눈 것으로 보고 뺀다. 기준의 3배 이상 떨어진 것도 뺀다.
- 직원 화면(`.workspace-side`, `.staff-login-screen`)은 틀이 달라 아직 보지 않는다. 키오스크는 글자 1배에서만 본다.
- 빨리 돌리기: `LAYOUT_PAGES=/,/help LAYOUT_WIDTHS=390,1333 LAYOUT_SCALES=1 npx tsx scripts/layout-check.ts` (Git Bash 에서는 `MSYS_NO_PATHCONV=1` 필요)

## 고치기 전 어긋난 곳 (25곳) → 고친 뒤 0곳
| 화면 | 전 | 후 | 원인·고친 곳 |
|---|---|---|---|
| 웹 카드 사이(`/`, `/services`) | 12px | 16px | `.ph-list` gap `--space-3` → `--space-4` |
| 웹 `/help` 바 아래 | 32px | 16px | `.request-experience` 윗여백이 바 아래 여백과 겹침 |
| 길 안내 지도 위(`/navigate`) | 12px (휴대전화 44px) | 16px | 지도 `margin-top`, 휴대전화 본문 칸 윗여백이 겹침 |
| 휴대전화 `/` 바·카드 아래 | 40px | 16px | `.task-home` 윗아랫여백이 겹침 |
| 푸터 위 | 8px | 16px | `.public-footer` `margin-top` |
| 안내 키오스크 바 아래 | 52px(기준의 두 배) | 26px | 본문 칸 여백(`--space-5`)과 상자 여백이 겹침 |
| 안내 키오스크 카드 사이 | 19.5px | 26px | `.haneuli-ways` gap |
| 입구·안내로봇 바 아래, 카드 사이 | 13px(기준의 절반) | 26px | `.flow.kiosk-content` gap, `.kx-pass`·`.kc-entry-services`·`.kc-menu` gap |

세로 스크롤은 안내 키오스크·입구·서비스 고르기 모두 1920×1080 · 1280×800 · 1024×768 · 1080×1920 에서 0 으로 유지했다(서비스 고르기 카드 높이는 98 ~ 204px).
