# 키오스크 서비스 카드 공통 규격 — B안

기준 main: 48a2e72. 안내 중심 소개·확인 동작과 입구의 탑승권 확인 칸은 유지합니다. 안내 첫 화면의 탑승권·여권·번호 카드는 서비스 카드가 아니므로 변경하지 않았습니다. 등록 질문을 나누거나 #121의 등록 배치를 적용하지 않았습니다.

## 공통 규격

- 서비스 카드의 유일한 규칙은 kiosk-layout.css의 .svc-card입니다. components.css의 옛 규칙과 kc-menu·kc-entry-services의 중복 규칙을 제거했습니다.
- 카드 높이는 가로 큰 화면4.5rem, 나머지3.5rem(최소64px), 안쪽 여백space-2, 그림1.25rem + 칩 여백space-2, 제목text-small·설명text-caption입니다. 제목은 위쪽에서 같은 위치에 시작하고 설명은 그 아래 같은 줄에 놓입니다. 내용·링크·낭독 순서는 유지합니다.
- 입구 첫 화면도 같은 마크업을 사용합니다. 웹 TaskLauncher는 기본값이 기존 표현이므로 변경하지 않습니다.
- 가로 화면의 기존 열 수는 유지하고 세로 서비스 화면은 기존 서비스 순서로 한 줄에 쌓습니다. 추가·제거한 서비스는 없습니다.

## 전후 실측

| 화면 | 크기 | 배율 | 카드 높이 전 → 뒤 | 여백 전 → 뒤 | 아이콘 칩 너비 전 → 뒤 | doc 전 → 뒤 / vh | 옆 넘침 전 → 뒤 |
|---|---|---|---|---|---|---|---|
| /kiosk/guide 확인 후 | 1920×1080 | 1 | 221.58 → 117 | 19.50 → 13 | 58.50 → 58.50 | 1080 → 1080 / 1080 | 0 → 0 |
| /kiosk/guide 확인 후 | 1920×1080 | 1.5 | 189.03 → 175.50 | 29.25 → 19.50 | 87.75 → 87.75 | 1080 → 1080 / 1080 | 0 → 0 |
| /kiosk/guide 확인 후 | 1024×768 | 1 | 108.22·108.23 → 64 | 13.50 → 9 | 40.50 → 40.50 | 768 → 768 / 768 | 0 → 0 |
| /kiosk/guide 확인 후 | 1024×768 | 1.5 | 94.38·94.39 → 94.50 | 20.25 → 13.50 | 60.75 → 60.75 | 768 → 768 / 768 | 0 → 0 |
| /kiosk/guide 확인 후 | 1080×1920 | 1 | 359.31 → 91 | 19.50 → 13 | 58.50 → 58.50 | 1920 → 1920 / 1920 | 0 → 0 |
| /kiosk/guide 확인 후 | 1080×1920 | 1.5 | 323.45·323.47 → 136.50 | 29.25 → 19.50 | 87.75 → 87.75 | 1920 → 1920 / 1920 | 0 → 0 |
| /kiosk/entry 첫 화면 | 1920×1080 | 1 | 228.92 → 117 | 19.50 → 13 | 39 → 58.50 | 1080 → 1080 / 1080 | 0 → 0 |
| /kiosk/entry 확인 후 | 1920×1080 | 1 | 703.75 → 117 | 19.50 → 13 | 58.50 → 58.50 | 1080 → 1080 / 1080 | 0 → 0 |
| /kiosk/entry 첫 화면 | 1920×1080 | 1.5 | 188.44·188.45 → 175.50 | 29.25 → 19.50 | 58.50 → 87.75 | 1080 → 1080 / 1080 | 0 → 0 |
| /kiosk/entry 확인 후 | 1920×1080 | 1.5 | 625.61 → 175.50 | 29.25 → 19.50 | 87.75 → 87.75 | 1080 → 1080 / 1080 | 0 → 0 |
| /kiosk/entry 첫 화면 | 1024×768 | 1 | 160.16 → 64 | 13.50 → 9 | 27 → 40.50 | 768 → 768 / 768 | 0 → 0 |
| /kiosk/entry 확인 후 | 1024×768 | 1 | 229.95 → 64 | 13.50 → 9 | 40.50 → 40.50 | 768 → 768 / 768 | 0 → 0 |
| /kiosk/entry 첫 화면 | 1024×768 | 1.5 | 132.81 → 94.50 | 20.25 → 13.50 | 40.50 → 60.75 | 768 → 768 / 768 | 0 → 0 |
| /kiosk/entry 확인 후 | 1024×768 | 1.5 | 209.02·209.03 → 94.50 | 20.25 → 13.50 | 60.75 → 60.75 | 768 → 768 / 768 | 0 → 0 |
| /kiosk/entry 첫 화면 | 1080×1920 | 1 | 354.28 → 91 | 19.50 → 13 | 39 → 58.50 | 1920 → 1920 / 1920 | 0 → 0 |
| /kiosk/entry 확인 후 | 1080×1920 | 1 | 738.13 → 91 | 19.50 → 13 | 58.50 → 58.50 | 1920 → 1920 / 1920 | 0 → 0 |
| /kiosk/entry 첫 화면 | 1080×1920 | 1.5 | 231.38 → 136.50 | 29.25 → 19.50 | 58.50 → 87.75 | 1920 → 1920 / 1920 | 0 → 0 |
| /kiosk/entry 확인 후 | 1080×1920 | 1.5 | 676.17·676.19 → 136.50 | 29.25 → 19.50 | 87.75 → 87.75 | 1920 → 1920 / 1920 | 0 → 0 |

아이콘 칩은 그림과 둘레 여백을 포함한 실제 경계 너비입니다. 픽셀 수치는 브라우저에서 측정한 결과이며 CSS에는 픽셀 크기를 새로 넣지 않았습니다.

## 동작·가림

- 도움 단추 전후 위치·크기 차이 조건 0/24, 바 단추 가림 0/24, 콘솔·페이지 오류 0/24.
- 확인 후 서비스 화면12조건의 본문 안 세로 넘침 0, 문서 세로 넘침 0.
- 같은 크기·배율에서 안내·입구의 카드 내부 아이콘·제목·설명 시작점 차이는 6조합 모두 0px입니다.
- 하늘이 첫 화면은 배율1에서 세 크기 모두 doc=vh입니다. 배율1.5의 기존 첫 화면 넘침은 별도 범위로 남기며 카드 규격 통일로 없앴다고 보고하지 않습니다.

## 실제 화면

| 화면·크기·배율 | 전 | 뒤 |
|---|---|---|
| guide first 1920 / 1 | ![](before-guide-first-1920-1.png) | ![](after-guide-first-1920-1.png) |
| guide first 1920 / 1.5 | ![](before-guide-first-1920-1.5.png) | ![](after-guide-first-1920-1.5.png) |
| guide first 1024 / 1 | ![](before-guide-first-1024-1.png) | ![](after-guide-first-1024-1.png) |
| guide first 1024 / 1.5 | ![](before-guide-first-1024-1.5.png) | ![](after-guide-first-1024-1.5.png) |
| guide first 1080 / 1 | ![](before-guide-first-1080-1.png) | ![](after-guide-first-1080-1.png) |
| guide first 1080 / 1.5 | ![](before-guide-first-1080-1.5.png) | ![](after-guide-first-1080-1.5.png) |
| guide services 1920 / 1 | ![](before-guide-services-1920-1.png) | ![](after-guide-services-1920-1.png) |
| guide services 1920 / 1.5 | ![](before-guide-services-1920-1.5.png) | ![](after-guide-services-1920-1.5.png) |
| guide services 1024 / 1 | ![](before-guide-services-1024-1.png) | ![](after-guide-services-1024-1.png) |
| guide services 1024 / 1.5 | ![](before-guide-services-1024-1.5.png) | ![](after-guide-services-1024-1.5.png) |
| guide services 1080 / 1 | ![](before-guide-services-1080-1.png) | ![](after-guide-services-1080-1.png) |
| guide services 1080 / 1.5 | ![](before-guide-services-1080-1.5.png) | ![](after-guide-services-1080-1.5.png) |
| entry first 1920 / 1 | ![](before-entry-first-1920-1.png) | ![](after-entry-first-1920-1.png) |
| entry first 1920 / 1.5 | ![](before-entry-first-1920-1.5.png) | ![](after-entry-first-1920-1.5.png) |
| entry first 1024 / 1 | ![](before-entry-first-1024-1.png) | ![](after-entry-first-1024-1.png) |
| entry first 1024 / 1.5 | ![](before-entry-first-1024-1.5.png) | ![](after-entry-first-1024-1.5.png) |
| entry first 1080 / 1 | ![](before-entry-first-1080-1.png) | ![](after-entry-first-1080-1.png) |
| entry first 1080 / 1.5 | ![](before-entry-first-1080-1.5.png) | ![](after-entry-first-1080-1.5.png) |
| entry services 1920 / 1 | ![](before-entry-services-1920-1.png) | ![](after-entry-services-1920-1.png) |
| entry services 1920 / 1.5 | ![](before-entry-services-1920-1.5.png) | ![](after-entry-services-1920-1.5.png) |
| entry services 1024 / 1 | ![](before-entry-services-1024-1.png) | ![](after-entry-services-1024-1.png) |
| entry services 1024 / 1.5 | ![](before-entry-services-1024-1.5.png) | ![](after-entry-services-1024-1.5.png) |
| entry services 1080 / 1 | ![](before-entry-services-1080-1.png) | ![](after-entry-services-1080-1.png) |
| entry services 1080 / 1.5 | ![](before-entry-services-1080-1.5.png) | ![](after-entry-services-1080-1.5.png) |
| 보조 실측 guide 390 / 1 | ![](before-guide-services-390-1.png) | ![](after-guide-services-390-1.png) |
| 보조 실측 entry 390 / 1 | ![](before-entry-services-390-1.png) | ![](after-entry-services-390-1.png) |
| 보조 실측 guide 1333 / 1 | ![](before-guide-services-1333-1.png) | ![](after-guide-services-1333-1.png) |
| 보조 실측 entry 1333 / 1 | ![](before-entry-services-1333-1.png) | ![](after-entry-services-1333-1.png) |

## 점검

2026-11-10 최종 소스에서 확인했습니다.

- tsc: 종료 0. eslint: 오류 0, 기존 경고 3개.
- vitest: 1,015개 통과, 5개 건너뜀(파일 64개 통과, 1개 건너뜀). 작업자 수를 2로 제한했습니다.
- layout-check: 화면 216개, 문제 0개, 종료 0.
- 전체 e2e: 295/295 통과, 실패 0개, 화면 그림 66장, 종료 0. 번호 입력 잠금 검사도 통과했습니다.
- 이전 중단 실행은 위 통과 수에 포함하지 않았습니다. 점검 스크립트·판정 기준은 수정하지 않았습니다.

## 남은 범위

- 운영 실측은 접속 코드 문제로 건너뜀. 로컬 main과 수정본으로 비교했습니다.
- 실제 하드웨어 카메라·스피커·직원 출동은 재지 않음. 휴대전화 바·지도 끝선 및 #114의 규칙은 수정하지 않았습니다.
