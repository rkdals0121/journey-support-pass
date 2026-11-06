## 무엇을 바꿨나

길 안내와 이동 도움 화면을 공통 서비스 디자인으로 맞추고, 키오스크·안내로봇에서 지도와 목적지 선택을 쓰기 쉽게 정리했습니다.

- 이동 도움받기는 메인 상단바를 유지하고, 아래에 이전·제목을 따로 표시합니다. 하늘이·소리 안내·도움 요청은 한 안내 카드로 묶습니다.
- 로봇은 큰 세로 화면을 기준으로 위에 지도를, 아래에 위치 선택과 검색을 둡니다. 지도에 흰 여백을 넣고, 소리 안내는 제목 안의 원형 아이콘으로 정렬합니다. 전체 페이지가 함께 스크롤됩니다.
- 출발지·목적지 사이에 위치 교환, 오른쪽에 다시 설정을 배치합니다. 다시 설정은 두 위치와 검색·경로를 함께 지웁니다. 현재 위치와 기기 전환·도착·안내 종료 흐름은 유지합니다.
- 키오스크의 설정 창을 줄여 지도 공간을 확보하고, 다른 시설을 안내데스크 옆으로 옮깁니다. 시설 이용 불편의 입력창 높이도 맞춥니다.
- 전동차 요청은 직원 지원으로 처리하고, 시설 표시에는 출발지의 보안구역을 반영합니다. 내 요청에서 직원·안내로봇을 구분합니다.
- 서비스 개수는 실제 표시하는 카드 배열에서 계산합니다. 고정 숫자나 추가 개수 상수를 사용하지 않습니다.

## 확인 (AGENTS.md 6절)

| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit -p .` | 통과 |
| `npx eslint src` | 오류 0, 기존 경고 3 |
| `npx vitest run --maxWorkers=2` | 1,015개 통과 / 5개 건너뜀 (64개 파일 통과, 1개 파일 건너뜀) |
| `npm run build` | 통과 |
| `scripts/layout-check.ts` | 144개 화면 검사 / 문제 0개 (접힌 시설 목록 수정 후 재실행) |
| `scripts/e2e.ts` | 79개 통과 / 1개 실패 후 서류 OCR 단계에서 중단. 이후 시나리오 미실행 |
| 변경 기능 브라우저 검사 | 지도 18개 조합, 시설 입력 정렬 12개 조합, 이동 도움 제목/묶음 6개 조합 통과 |
| 상단바·소리·지도 여백 | 상단 18개 조합 및 영어 2개 페이지, 메뉴 열기/닫기, 원형 선택, 제목 내부 소리 아이콘 켜기/끄기, 중심 정렬과 지도 여백 확인 |

- [x] 휴대전화·노트북·키오스크·로봇 화면 첨부
- [x] 변경 화면에서 1.5배 글자와 가로 넘침 확인
- [x] `layout.tsx`에 덮어쓰기 CSS를 추가하지 않음. 기존 파일과 토큰 사용
- [x] DB 구조 변경 없음
- [x] 새 외부 지도·이미지 자료 추가 없음. 기존 출처·이용 조건 유지
- [ ] Vercel 미리보기에서 `/`, `/register`, `/kiosk`, `/staff/login` 확인
- [ ] 전체 e2e 통과 및 실물 기기 음성·터치 확인

### 확인이 남은 부분

이번 PR은 **Draft**로 준비합니다. 전체 e2e에서 등록 서류 OCR의 외부 worker 스크립트(`cdn.jsdelivr.net`)를 가져오지 못했습니다. 이후 서류 인식 완료를 기다리다 240초 제한으로 중단됐습니다. 이때까지 79개 통과·1개 실패이며, 전체 흐름 통과로 표시하지 않습니다. 해당 `src/app/components/DocScan.tsx`는 이 PR에서 변경하지 않았습니다. 외부 리소스를 받을 수 있는 환경에서 전체 e2e 재실행과 배포 미리보기 확인 후 Ready for review로 바꿔 주세요.

자동 생성된 실행 기록은 [service-map-e2e.md](service-map-e2e.md)에 보존했습니다. 기존 main의 전체 화면 점검표를 부분 실행 결과로 덮어쓰지 않았습니다.

화면 배치 검사에서 접힌 「다른 시설」의 내부 카드가 좁게 계산되는 6건을 발견해, 접힌 동안 내부 목록을 배치하지 않도록 수정했습니다. 목록을 펼치면 기존처럼 전체 폭에 표시됩니다. 최종 재검사 결과는 위 표에 적습니다.

## 화면

아래 `docs/design-before-after/service-map-ui/`의 그림을 확인해 주세요.

- [이동 도움받기 노트북](https://github.com/rkdals0121/journey-support-pass/blob/feat/accessible-service-map-ui/docs/design-before-after/service-map-ui/mobility-laptop.png)
- [휴대전화](https://github.com/rkdals0121/journey-support-pass/blob/feat/accessible-service-map-ui/docs/design-before-after/service-map-ui/mobility-phone.png)
- [로봇 1080×1920](https://github.com/rkdals0121/journey-support-pass/blob/feat/accessible-service-map-ui/docs/design-before-after/service-map-ui/robot-portrait.png)
- [키오스크 1920×1080](https://github.com/rkdals0121/journey-support-pass/blob/feat/accessible-service-map-ui/docs/design-before-after/service-map-ui/kiosk-wide.png)
- [4:3 키오스크 1024×768](https://github.com/rkdals0121/journey-support-pass/blob/feat/accessible-service-map-ui/docs/design-before-after/service-map-ui/kiosk-accessible.png)
- [소리 아이콘·위치 선택](https://github.com/rkdals0121/journey-support-pass/blob/feat/accessible-service-map-ui/docs/design-before-after/service-map-ui/robot-controls.png)
- [시설 입력창 정렬](https://github.com/rkdals0121/journey-support-pass/blob/feat/accessible-service-map-ui/docs/design-before-after/service-map-ui/facility-input-alignment.png)

`before-*`는 작업 초기 지도 브랜치 `0443a56`의 화면입니다. 최종 코드 비교 기준은 `main`의 `d504712`이며, 중간에 버린 디자인 시안은 이 PR에 포함하지 않았습니다.

실제 로봇 제어와 실물 기기 검증은 포함하지 않습니다. 로봇의 34×60cm는 세로 비율 참고이며 실제 장비 해상도가 확정되었다고 가정하지 않습니다. 긴 목록과 큰 글자는 페이지를 내려 읽을 수 있습니다.
