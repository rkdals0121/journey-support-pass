# 스탬프북 공용 입구 — B안

작업 기준 main: 358f6c7(실측·전체 e2e). 이후 최신 main(#126·#127 포함)으로 옮겨 타입·린트·규칙·단위·배치 점검을 다시 했다(스탬프북 파일은 그 사이 바뀌지 않았다). 기존 수첩 선택3개를 공용 PublicShell 안에 바로 표시합니다. 중간 화면·추가 클릭은 없습니다. 각 수첩·도장·완료·사진 화면의 기존 디자인과 저장·수집 규칙은 유지합니다.

## 변경

- 입구는 기존 공용 바·하단 바를 재사용하며 스탬프 CSS에서만 같은 너비 공식을 사용합니다. site-bar.css의 휴대전화 규칙은 변경하지 않았습니다.
- 전용 수집 화면에는 서비스 복귀 링크와 내비게이션 이름을 공통으로 제공합니다. 수첩의 기존 뒤로가기·테마 변경 동작도 유지합니다.
- 입구에서 고른 글자 크기를 수집 화면에서도 이어 씁니다. 큰 글자에서 칸이 옆으로 밀리지 않도록 원래 목록 격자의 최소 너비를 수정했습니다.
- 사진 고르기 파일 입력은 보이는 선택 단추에 연결한 채 HTML hidden으로 둡니다. 일반 입력칸 너비가 sr-only 파일 입력에 적용돼 생기던 가로 넘침을 제거합니다. 사진·인증 처리 로직은 바꾸지 않았습니다.

## 전후 실측

### 공용 간격과 끝선

| 크기 | 배율 | 바 아래 첫 박스 | 카드 사이 | 바와 좌우 끝 차이 |
|---|---|---|---|---|
| 320×640 | 1 / 1.5 | 16 / 24px | 16 / 24px | 0 / 0px |
| 390×844 | 1 / 1.5 | 16 / 24px | 16 / 24px | 0 / 0px |
| 1333×750 | 1 / 1.5 | 16 / 24px | 16 / 24px | 0 / 0px |

간격은 `--space-4`이며 글자 배율에 함께 반응합니다. 공용 틀 추가로 늘어난 문서 높이는 아래 표에 그대로 기록했습니다. 콘텐츠를 숨기거나 수첩 선택 단계를 추가하지 않았습니다.

| 화면 상태 | 크기 | 배율 | doc 전 → 뒤 / vh | 옆 넘침 전 → 뒤 |
|---|---|---|---|---|
| themes | 320×640 | 1 | 685 → 973 / 640 | 0 → 0 |
| cover | 320×640 | 1 | 716 → 772 / 640 | 0 → 0 |
| home | 320×640 | 1 | 1311 → 1392 / 640 | 0 → 0 |
| got | 320×640 | 1 | 640 → 669 / 640 | 0 → 0 |
| done | 320×640 | 1 | 681 → 737 / 640 | 0 → 0 |
| reload | 320×640 | 1 | 681 → 737 / 640 | 0 → 0 |
| camera | 320×640 | 1 | 641 → 697 / 640 | 1 → 0 |
| photo-back | 320×640 | 1 | 681 → 737 / 640 | 0 → 0 |
| themes | 320×640 | 1.5 | 1514 → 1989 / 640 | 0 → 0 |
| cover | 320×640 | 1.5 | 1115 → 1199 / 640 | 0 → 0 |
| home | 320×640 | 1.5 | 2337 → 2430 / 640 | 0 → 0 |
| got | 320×640 | 1.5 | 879 → 996 / 640 | 0 → 0 |
| done | 320×640 | 1.5 | 910 → 994 / 640 | 0 → 0 |
| reload | 320×640 | 1.5 | 910 → 994 / 640 | 0 → 0 |
| camera | 320×640 | 1.5 | 829 → 913 / 640 | 9 → 0 |
| photo-back | 320×640 | 1.5 | 910 → 994 / 640 | 0 → 0 |
| themes | 390×844 | 1 | 844 → 872 / 844 | 0 → 0 |
| cover | 390×844 | 1 | 844 → 844 / 844 | 0 → 0 |
| home | 390×844 | 1 | 1274 → 1324 / 844 | 0 → 0 |
| got | 390×844 | 1 | 844 → 844 / 844 | 0 → 0 |
| done | 390×844 | 1 | 844 → 844 / 844 | 0 → 0 |
| reload | 390×844 | 1 | 844 → 844 / 844 | 0 → 0 |
| camera | 390×844 | 1 | 844 → 844 / 844 | 1 → 0 |
| photo-back | 390×844 | 1 | 844 → 844 / 844 | 0 → 0 |
| themes | 390×844 | 1.5 | 1254 → 1452 / 844 | 0 → 0 |
| cover | 390×844 | 1.5 | 1046 → 1130 / 844 | 0 → 0 |
| home | 390×844 | 1.5 | 2050 → 2162 / 844 | 0 → 0 |
| got | 390×844 | 1.5 | 879 → 963 / 844 | 0 → 0 |
| done | 390×844 | 1.5 | 959 → 1043 / 844 | 0 → 0 |
| reload | 390×844 | 1.5 | 959 → 1043 / 844 | 0 → 0 |
| camera | 390×844 | 1.5 | 852 → 936 / 844 | 9 → 0 |
| photo-back | 390×844 | 1.5 | 959 → 1043 / 844 | 0 → 0 |
| themes | 1333×750 | 1 | 750 → 819 / 750 | 0 → 0 |
| cover | 1333×750 | 1 | 750 → 788 / 750 | 0 → 0 |
| home | 1333×750 | 1 | 1268 → 1324 / 750 | 0 → 0 |
| got | 1333×750 | 1 | 750 → 750 / 750 | 0 → 0 |
| done | 1333×750 | 1 | 754 → 810 / 750 | 0 → 0 |
| reload | 1333×750 | 1 | 754 → 810 / 750 | 0 → 0 |
| camera | 1333×750 | 1 | 758 → 814 / 750 | 420 → 0 |
| photo-back | 1333×750 | 1 | 754 → 810 / 750 | 0 → 0 |
| themes | 1333×750 | 1.5 | 994 → 1174 / 750 | 0 → 0 |
| cover | 1333×750 | 1.5 | 1036 → 1120 / 750 | 0 → 0 |
| home | 1333×750 | 1.5 | 1880 → 1973 / 750 | 0 → 0 |
| got | 1333×750 | 1.5 | 870 → 954 / 750 | 0 → 0 |
| done | 1333×750 | 1.5 | 936 → 1020 / 750 | 0 → 0 |
| reload | 1333×750 | 1.5 | 936 → 1020 / 750 | 0 → 0 |
| camera | 1333×750 | 1.5 | 904 → 988 / 750 | 308 → 0 |
| photo-back | 1333×750 | 1.5 | 936 → 1020 / 750 | 0 → 0 |

수첩3종 × 3크기 × 배율1·1.5 × 입구·표지·수집·도장·완료·새로고침·사진·사진 복귀8상태 = 전후 각각144개 실측입니다. 세로가 긴 기존 수집 화면은 문서 전체 스크롤을 허용하며 잘라 숨기지 않았습니다.

## 동작 확인

- 수정 후 가로 넘침 0/144, 이름 없는 조작 요소 0/144, 페이지 오류 0/144.
- 18경로 모두 실제 수첩 선택→표지 입력→고유번호로 도장6개 수집→완료→새로고침→사진 화면→복귀→서비스 왕복을 실행하고 수집 기록이 유지됨을 확인했습니다.
- 추가 사진 검사18조건은 완료 상태의 시험 자료와 Chrome 시험용 카메라를 사용해 실제 촬영 단추·사진 저장·인증 생성·새로고침 보존을 확인했습니다. 실제 사람의 얼굴·실제 기기 카메라 성능을 측정한 것이 아닙니다.
- 입구와 바의 끝선 차이 최대 0px.

## 실제 화면

| 상태·크기·배율 | 전 | 뒤 |
|---|---|---|
| flight themes 320 / 1 | ![](before-flight-320-1-themes.png) | ![](after-flight-320-1-themes.png) |
| flight cover 320 / 1 | ![](before-flight-320-1-cover.png) | ![](after-flight-320-1-cover.png) |
| flight got 320 / 1 | ![](before-flight-320-1-got.png) | ![](after-flight-320-1-got.png) |
| flight done 320 / 1 | ![](before-flight-320-1-done.png) | ![](after-flight-320-1-done.png) |
| flight camera 320 / 1 | ![](before-flight-320-1-camera.png) | ![](after-flight-320-1-camera.png) |
| flight themes 320 / 1.5 | ![](before-flight-320-1.5-themes.png) | ![](after-flight-320-1.5-themes.png) |
| flight cover 320 / 1.5 | ![](before-flight-320-1.5-cover.png) | ![](after-flight-320-1.5-cover.png) |
| flight got 320 / 1.5 | ![](before-flight-320-1.5-got.png) | ![](after-flight-320-1.5-got.png) |
| flight done 320 / 1.5 | ![](before-flight-320-1.5-done.png) | ![](after-flight-320-1.5-done.png) |
| flight camera 320 / 1.5 | ![](before-flight-320-1.5-camera.png) | ![](after-flight-320-1.5-camera.png) |
| flight themes 390 / 1 | ![](before-flight-390-1-themes.png) | ![](after-flight-390-1-themes.png) |
| flight cover 390 / 1 | ![](before-flight-390-1-cover.png) | ![](after-flight-390-1-cover.png) |
| flight got 390 / 1 | ![](before-flight-390-1-got.png) | ![](after-flight-390-1-got.png) |
| flight done 390 / 1 | ![](before-flight-390-1-done.png) | ![](after-flight-390-1-done.png) |
| flight camera 390 / 1 | ![](before-flight-390-1-camera.png) | ![](after-flight-390-1-camera.png) |
| flight themes 390 / 1.5 | ![](before-flight-390-1.5-themes.png) | ![](after-flight-390-1.5-themes.png) |
| flight cover 390 / 1.5 | ![](before-flight-390-1.5-cover.png) | ![](after-flight-390-1.5-cover.png) |
| flight got 390 / 1.5 | ![](before-flight-390-1.5-got.png) | ![](after-flight-390-1.5-got.png) |
| flight done 390 / 1.5 | ![](before-flight-390-1.5-done.png) | ![](after-flight-390-1.5-done.png) |
| flight camera 390 / 1.5 | ![](before-flight-390-1.5-camera.png) | ![](after-flight-390-1.5-camera.png) |
| flight themes 1333 / 1 | ![](before-flight-1333-1-themes.png) | ![](after-flight-1333-1-themes.png) |
| flight cover 1333 / 1 | ![](before-flight-1333-1-cover.png) | ![](after-flight-1333-1-cover.png) |
| flight got 1333 / 1 | ![](before-flight-1333-1-got.png) | ![](after-flight-1333-1-got.png) |
| flight done 1333 / 1 | ![](before-flight-1333-1-done.png) | ![](after-flight-1333-1-done.png) |
| flight camera 1333 / 1 | ![](before-flight-1333-1-camera.png) | ![](after-flight-1333-1-camera.png) |
| flight themes 1333 / 1.5 | ![](before-flight-1333-1.5-themes.png) | ![](after-flight-1333-1.5-themes.png) |
| flight cover 1333 / 1.5 | ![](before-flight-1333-1.5-cover.png) | ![](after-flight-1333-1.5-cover.png) |
| flight got 1333 / 1.5 | ![](before-flight-1333-1.5-got.png) | ![](after-flight-1333-1.5-got.png) |
| flight done 1333 / 1.5 | ![](before-flight-1333-1.5-done.png) | ![](after-flight-1333-1.5-done.png) |
| flight camera 1333 / 1.5 | ![](before-flight-1333-1.5-camera.png) | ![](after-flight-1333-1.5-camera.png) |
| explorer themes 390 / 1 | ![](before-explorer-390-1-themes.png) | ![](after-explorer-390-1-themes.png) |
| explorer cover 390 / 1 | ![](before-explorer-390-1-cover.png) | ![](after-explorer-390-1-cover.png) |
| explorer got 390 / 1 | ![](before-explorer-390-1-got.png) | ![](after-explorer-390-1-got.png) |
| explorer done 390 / 1 | ![](before-explorer-390-1-done.png) | ![](after-explorer-390-1-done.png) |
| explorer camera 390 / 1 | ![](before-explorer-390-1-camera.png) | ![](after-explorer-390-1-camera.png) |
| explorer themes 390 / 1.5 | ![](before-explorer-390-1.5-themes.png) | ![](after-explorer-390-1.5-themes.png) |
| explorer cover 390 / 1.5 | ![](before-explorer-390-1.5-cover.png) | ![](after-explorer-390-1.5-cover.png) |
| explorer got 390 / 1.5 | ![](before-explorer-390-1.5-got.png) | ![](after-explorer-390-1.5-got.png) |
| explorer done 390 / 1.5 | ![](before-explorer-390-1.5-done.png) | ![](after-explorer-390-1.5-done.png) |
| explorer camera 390 / 1.5 | ![](before-explorer-390-1.5-camera.png) | ![](after-explorer-390-1.5-camera.png) |
| friend themes 390 / 1 | ![](before-friend-390-1-themes.png) | ![](after-friend-390-1-themes.png) |
| friend cover 390 / 1 | ![](before-friend-390-1-cover.png) | ![](after-friend-390-1-cover.png) |
| friend got 390 / 1 | ![](before-friend-390-1-got.png) | ![](after-friend-390-1-got.png) |
| friend done 390 / 1 | ![](before-friend-390-1-done.png) | ![](after-friend-390-1-done.png) |
| friend camera 390 / 1 | ![](before-friend-390-1-camera.png) | ![](after-friend-390-1-camera.png) |
| friend themes 390 / 1.5 | ![](before-friend-390-1.5-themes.png) | ![](after-friend-390-1.5-themes.png) |
| friend cover 390 / 1.5 | ![](before-friend-390-1.5-cover.png) | ![](after-friend-390-1.5-cover.png) |
| friend got 390 / 1.5 | ![](before-friend-390-1.5-got.png) | ![](after-friend-390-1.5-got.png) |
| friend done 390 / 1.5 | ![](before-friend-390-1.5-done.png) | ![](after-friend-390-1.5-done.png) |
| friend camera 390 / 1.5 | ![](before-friend-390-1.5-camera.png) | ![](after-friend-390-1.5-camera.png) |
| 시험용 카메라 촬영 뒤 flight | 해당 없음 | ![](photo-flight-390-1.png) |
| 시험용 카메라 촬영 뒤 explorer | 해당 없음 | ![](photo-explorer-390-1.png) |
| 시험용 카메라 촬영 뒤 friend | 해당 없음 | ![](photo-friend-390-1.png) |

## 점검

- 작업 기준 main(358f6c7)에서: 전체 e2e **295/295 통과**, 수집·완료·새로고침 보존·서비스 왕복 144개 상태 모두 통과, 시험용 카메라 사진 저장 18조건 통과, 실제 파일 선택 창 사진 저장 3수첩 통과.
- 최신 main 에 옮긴 뒤: `npx tsc --noEmit -p .` 오류 0, `npx eslint src` 오류 0(기존 경고 3개), `npx vitest run` 1,015개 통과·5개 건너뜀, `node scripts/rules-check.mjs` 통과, `npx tsx scripts/layout-check.ts` **264개 화면 문제 0개**(`/stamp` 포함).
- 옮긴 뒤 직접 확인: `/stamp` 의 공용 위·아래 바, 수첩 선택 3개, 수첩 열기, 「서비스로 돌아가기」(`/services`), 다시 들어왔을 때 수첩 유지, 페이지 오류 없음.

## 확인 못 한 것

- 운영 실측은 접속 코드 문제로 건너뜀.
- 실제 카메라·얼굴 인식 정확도·인쇄·다운로드한 사진의 외부 공유는 재지 않음.
- 모든 탑승구·경로형 조합의 수집 규칙은 새로 전수 검사하지 않았습니다. 규칙 코드는 변경하지 않았으며 기존 단위 검사와 놀이형 코스의 실제 수집 경로를 확인합니다.
