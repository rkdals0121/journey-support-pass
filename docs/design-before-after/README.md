# 디자인 검토 자료

`index.html`은 경로와 너비로 검색하는 전후 비교, `flows.html`은 실제 기능 시나리오의 단계별 화면이다. 정적 서버로 이 폴더를 열거나 HTML을 직접 열 수 있다.

## 촬영 기준
- 원본: main `5e7f5d6`의 별도 소스 내보내기. 원본 CSS를 새 DOM에 덮어 씌우는 방식이 아니다.
- 개선 후: `design/04-motion-verification`까지의 변경.
- 휴대전화 390×844, 가로 기기 1280×800, 세로 기기 1080×1920. 직원 화면은 앞의 두 크기.
- 원본 159장, 개선 후 161장. 기존 159개 조합을 비교하고 직원 부품 전시장 2개 조합을 추가했다.
- 로그인과 구역 선택은 실제 해당 화면에 도착한 상태를 촬영한다. 접수 상세는 모의 요청을 선택한 상태를 포함한다.
- `/error.tsx (오류 표시)`는 실제 오류 컴포넌트를 앱 스타일·폰트로 렌더링한 격리 미리보기다. 라우터 링크는 동일한 링크 마크업으로 치환했다. 서버 장애를 발생시킨 통합 검사가 아니다.
- 실제 시각과 가상 데이터이므로 전후의 날짜·잔여시간·번호는 다를 수 있다. 픽셀 동일성 검사가 아니다.

## 검증 범위와 한계
브라우저 시나리오, 자동 접근성, 작은/큰 글씨, 고대비, reduced-motion, 인쇄 레이아웃을 검사한다. 실물 로봇·차량·항공사·기관 운영 시스템 연결, 실제 카메라와 인쇄물 스캔, 화면 읽기 도구를 이용한 사용자 평가는 이 자료로 입증하지 않는다. 기존 시연 및 미연동 표시는 유지했다.

## 재현
격리된 로컬 모의 서버를 준비하고 `DESIGN_BASE=http://127.0.0.1:3000`, `DESIGN_PHASE=after`로 지정한다. 배포 서비스에는 실행하지 않는다.
1. `npx tsx scripts/design-capture.ts`
2. `npx tsx scripts/design-receipt-capture.ts`
3. `npx tsx scripts/design-auth-capture.ts`
4. `node scripts/design-error-capture.mjs`
5. `node scripts/design-compare.mjs`
6. 최종 E2E 결과가 있을 때 `node scripts/design-flow-gallery.mjs`

스타일 검사: `node scripts/design-contracts.mjs`, `node scripts/design-contrast.mjs`. 브라우저 검사: `npx tsx scripts/design-quality.ts`, `node scripts/design-motion-check.mjs`. 이전 단계의 migrate/normalize/passenger 스크립트는 이미 적용한 일회성 변환이며 반복 실행하지 않는다.

최종 PR은 main을 기준으로 1~4단계 결과를 묶는다. 1~3단계와 별도 화면 개편이 이미 main에 들어 있으므로 이를 상속하고, 모션·인쇄·최종 검증 차이만 추가한다. 병합·운영 배포는 수행하지 않는다.
