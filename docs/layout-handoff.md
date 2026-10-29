# 화면 구성 개편 인계 메모

GPT의 디자인 1~3단계는 색·글자·스타일 파일 정리만 했고 화면 구성(배치, 순서, 강조)은 그대로였다.
이 작업은 그 위에서 **화면 구성**을 다시 짠다. 동작·API·데이터는 바꾸지 않는다.

## 작업 방식
- 작업 폴더: `jsp-layout` (git worktree). GPT가 쓰는 `journey-support-pass` 폴더는 건드리지 않는다.
- 브랜치: `layout/02-kiosk` → 다음은 `layout/01-passenger`, `layout/03-staff`. 바탕은 `origin/design/03-operations` + `origin/main`.
- 새 스타일은 `src/app/styles/kiosk-layout.css`(맨 마지막에 읽음)에만 쓴다. GPT 4단계가 `components/devices/passenger/staff/tokens.css`를 고치고 있어서 충돌을 줄이려는 것이다. 여객·직원도 각각 새 파일(`passenger-layout.css`, `staff-layout.css`)을 만든다.
- 색·글자·간격·움직임은 `tokens.css` 값만 쓴다. 노랑(`--color-accent`)은 화면마다 강조 하나에만 쓴다.
- 자동 점검이 쓰는 클래스(`.call-btn`, `.kiosk-personalise`, `.robot-pass-entry`, `.robot-number-entry`, `.pad-num .pad-key`, `.code-boxes`, `.listen-start` 등)는 남긴다.
- 로컬 확인: `.claude/launch.json`의 `jsp-layout`(포트 3002). DB가 비어 있으면 seed 코드로 `/api/admin/setup`에 `{codes, mockFlights:true}`를 보낸다(Bearer `dev-only-secret-change-me`). 키오스크 코드는 `db/seed-zones.json`의 공개 값.
- 점검: `E2E_BASE=http://localhost:3002 npx tsx scripts/e2e.ts`.

## 2. 키오스크·안내로봇 (layout/02-kiosk) — 한 것
- 공통 머리: 흰 띠를 화면 끝까지 깔고, 「도움 요청하기」를 머리 줄 오른쪽 끝으로 옮겼다(어느 화면에서나 같은 자리, 따로 한 줄을 차지하지 않음). 빠져 있던 `--call-h`를 되살려 휴대전화 도움 줄이 본문을 가리던 것도 고쳤다.
- 처음 화면(`KioskHome` 컴포넌트, 키오스크와 안내로봇이 함께 씀): 가로 화면은 왼쪽에 위치·제목·「탑승권으로 등록한 도움 불러오기」, 오른쪽에 같은 크기 서비스 칸(만남 예약 확인도 칸으로). 세로는 위→아래.
- 만남 예약 확인번호: 왼쪽 입력 칸·확인 버튼, 오른쪽 자판(숫자 3열 + 글자 2열). 8자리가 안 차면 버튼이 「8자리를 모두 눌러 주세요」로 바뀐다.
- 고유 일련 번호 입력: 같은 두 칸 틀.

## 남은 일
- 키오스크: 등록 키오스크(`/kiosk/register`), 안내가 열린 뒤 화면(내 안내·시설 칸), 입구로봇의 확인·서비스 화면, `/kiosk` 설치 화면, 키오스크에서 여는 길 안내·도움 요청 화면.
- 1. 여객 화면, 3. 직원 화면(왼쪽 메뉴가 화면 아래에서 잘리고 하얗게 비는 문제 포함).
