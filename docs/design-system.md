# 화면 디자인 시스템

## 기준
딥그린 `#2F5D46`, 노랑 `#E9C46A`, 따뜻한 미색 `#F7F6F1`. 색 정의의 원본은 `src/app/styles/tokens.css`다. 컴포넌트·SVG·화면 CSS는 `var(--color-*)`만 사용한다. QR 등 기계 판독 부호는 전용 machine-ink/machine-paper 토큰으로 원본 대비를 보존한다.

## 글자와 간격
- 글자 7단계: caption .75rem / small .875rem / body 1rem / heading 1.25rem / title 1.75rem / large 2.5rem / display 3.5rem.
- 굵기: 400 본문, 600 라벨, 700 제목. 숫자는 기존 Barlow Condensed 유지.
- 간격: .25 / .5 / .75 / 1 / 1.5 / 2 / 3 / 4rem.
- 모서리: .375rem / .75rem / pill. 그림자는 떠 있는 대화상자에만 사용.
- 배율 --scale와 data-kiosk/data-picture는 보존한다. 기존 고정 px 값은 rem으로 바꾼다. 원/곡선의 SVG 좌표는 벡터 좌표로 유지한다.

## 부품
- 한 화면에서 완료해야 할 행동만 primary 버튼으로 표시한다. 취소/이전/펼치기는 선 또는 텍스트 버튼이다.
- 입력 테두리는 장식용 구분선과 구분한다. 배경과 비교되는 control-line 토큰을 쓴다.
- 상태는 텍스트와 아이콘을 함께 사용한다. 오류만 error 팔레트를 사용한다.
- 노랑은 작은 현재 지점이나 중요한 안내 한 곳에 사용하며 본문 넓은 면에 칠하지 않는다. 브랜드 해바라기는 장식이 아닌 고정 표식이다.
- 직원용 부품 전시장: `/staff/design` (직원 로그인 필요, 실제 접수 없음).

## 모션
토큰 fast 120ms / normal 180ms / slow 240ms. 들어올 때 ease-out, 나갈 때 ease-in. 단계 전환/선택/상태 변화에만 쓴다. 반복은 로딩·진행 중에 한정하며 reduced-motion에서는 모든 변형/이동을 끈다.

## 대비
`node scripts/design-contrast.mjs`로 재계산. 결과는 `design-contrast.json`에 보관한다. 15개 본문 조합 모두 4.5:1 이상이어야 한다. 개별 화면은 axe 검사로 실제 겹친 배경과 비교한다. 고대비 환경 forced-colors는 시스템 Canvas/CanvasText/ButtonText/Highlight를 사용한다.

## 스타일 소유권
- tokens.css: 색·글자·간격·모서리·모션의 단일 정의.
- components.css: 공통 구조·조작 부품과 보존된 조건별 규칙. 이전 덧칠 파일은 삭제한다.
- 여객 화면은 passenger.css에서 관리한다. 기기·직원은 후속 단계에서 분리하며 동일 selector+조건을 여러 파일에서 정의하지 않는다.
- 기본 규칙 다음에 반응형 조건을 둔다. 추출 과정에서 데스크톱 기본값이 모바일 조건을 덮지 않도록 design-order.mjs로 정렬한다.
- support-journey.module.css는 예약/거점 컴포넌트의 지역 구조, stamp.css는 스탬프의 지역 구조를 소유한다. 두 파일도 색은 토큰을 참조한다.

프린트 및 캔버스 저장도 같은 색 원본을 쓴다. 사진 저장 SVG는 토큰 값을 함께 직렬화해서 저장된 파일의 그림이 사라지는 것을 막는다.

## 여객 화면의 정보 위계
휴대전화는 제목 → 한 가지 작업 → 다음 행동의 한 열 구조다. PC는 등록 단계/입력/요약의 세 영역을 분리한다. 서비스 탐색은 범주 목록, 실제 입력은 흰 작업 면으로 구분한다. 개인 안내에는 기존 데이터인 고유 일련 번호를 읽을 수 있는 크기로 표시한다. 오류 화면의 제목은 h1으로 제공한다.
