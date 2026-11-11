# 나랑이 안내 키오스크

> 2026-11: 캐릭터 이름을 「나랑이」로 확정했다(영어 Narangi). 화면에 보이는 문구만 바꿨고, 코드·파일 이름(`haneuli-*`, `public/images/haneuli`)과 점검 스크립트가 쓰는 클래스는 그대로다. 아래 글의 「하늘이」는 같은 캐릭터의 예전 이름이다.

## 첫 화면 구성 (2026-11-12 스케치 반영)
- 위쪽 큰 상자: 왼쪽 위에 제목·위치(작게), 가운데에 **큰 나랑이**, 오른쪽에 말풍선(꼬리가 나랑이 쪽). 말풍선 문구는 그대로 유지한다: 잘 때 「탑승권을 스캔해서 나랑이를 깨워 주세요!」, 깬 뒤 「확인 방법을 하나 골라 주세요!」, 찾는 중 「찾고 있어요!」. 건드리지 않으면 잠든 그림, 탑승권을 비추거나 화면을 누르면 깨어난 그림. 카메라를 쓸 수 없으면 말풍선 아래에 안내가 보인다.
- 아래 한 줄: 「탑승권이 없으신가요?」 다음에 **여권 스캔 · 예약번호 입력**(같은 너비의 둥근 단추)과 **둥근 소리 안내 단추**. 세 단추의 높이·위아래 끝선이 같다. 소리 단추는 그림만 보이고 이름(「소리로 안내 듣기」)은 화면 읽기 프로그램이 읽는다.
- 탑승권 읽기(카메라)는 화면에 칸을 두지 않고 켜 둔다.
- 세로 키오스크·안내로봇(1080×1920): 위에 나랑이, 그 아래 말풍선(꼬리가 위로), 맨 아래에 같은 한 줄 단추.
- 나랑이 크기(`--hw-art`)는 화면 높이에서 위쪽 바·제목·아래 줄 몫을 뺀 값이라 기기 크기 4가지(1920×1080·1280×800·1024×768·1080×1920) 모두 스크롤 0.

## 동작
- `/kiosk/guide`의 첫 화면을 해바라기 노랑·크림·초록 테마로 변경.
- 하늘이가 대기 중 좌우 이동하고 18초 뒤 잠든 모습으로 전환. 이후 32초 간격으로 쉬기/이동 반복.
- 대기 화면의 캐릭터/안내 영역을 터치하면 하늘이가 깨어나고 안내 카드가 확대되어 활성화. 첫 터치로 서비스가 잘못 실행되지 않게 처리.
- 대기 중에도 전면 카메라 스캐너가 켜져 있으며, 터치 전환 시 같은 카메라 스트림을 유지.
- 기존 `/api/kiosk/resolve` → 사전등록 내역 → 확인/수정 → 맞춤 서비스 흐름을 재사용.
- 번호 입력, 영어, 음성, 직원 호출 유지. 처음 화면 복귀 및 무응답 시 대기 상태 복귀.
- 움직임 줄이기 설정에서는 애니메이션 중단. 대기 중 서비스 링크는 inert로 초점/실행 차단.

## 검증
- `npx tsc --noEmit`, 변경 TSX 파일 ESLint 통과.
- `npx vitest run tests/kiosk-api.test.ts tests/qr-camera.test.ts`: 55개 통과.
- Chrome 브라우저: 설치 로그인 200, 로컬 모의 등록 200, QR 이미지 실제 디코딩 후 resolve 200, 저장 내역 및 맞춤 서비스 렌더 확인.
- 대기→수면→터치→메뉴 전환 확인. 터치 전후 MediaStreamTrack id 동일.
- 1440×1080, 1080×1920, 390×844 화면 확인. 가로 넘침 없음, pageerror 없음.
- 실물 탑승권/키오스크 카메라 하드웨어 검증은 별도 필요. 브라우저 검증은 모의 카메라와 실제 QR 이미지 디코딩 사용.

## 이미지
Built-in image_gen 사용. 사용자가 제공한 하늘이 디자인을 기준으로 생성하고 노란 헤드셋 밴드를 양쪽 귀까지 연결하도록 수정.
- `public/images/haneuli/narangi-sleep.webp`: 잠든 모습(2026-11 노란 나랑이 수정안)
- `public/images/haneuli/narangi.webp`, `public/stamp/narangi*.webp`: 정면·왼쪽·오른쪽(같은 수정안에서 오려 냄). 원본은 팀 폴더 「본선 (11월)/나랑이.png·나랑이2.png」

### Final prompt — hello correction
Edit this mascot asset. Critical correction: the character is wearing YELLOW HEADPHONES over the BLUE helmet. The yellow patch on top must be a single continuous yellow headphone headband arch extending down BOTH sides all the way to the WHITE circular ear cups. Recolor the currently blue/lavender side headband strips yellow so the whole external headband is yellow, not only the top patch. Only the circular ear cups are white with cyan illuminated centers. Keep blue helmet face rim, blue airplane fin, yellow wrist cuffs, entire character identity, face, pose, tablet, dimensions, transparent background unchanged. No text.

### Final prompt — sleep
Create sleeping pose variant of this exact mascot web asset. Keep exact character identity, same full body size and centered framing, blue helmet and airplane fin, CONTINUOUS YELLOW HEADPHONE HEADBAND from top down both sides to white circular ear cups with cyan center, yellow wrist cuffs. Change expression to both eyes peacefully closed curved lines, mouth tiny contented smile; lower waving hand to gently rest on dark tablet held in lap, head slightly tilted asleep. Same soft plush 3D rendering. Transparent background. No letters, no Z symbols, no background, no extra objects.

## 가로 화면 높이 수정 (2026-10-29)
가로 화면(너비 900px 이상)은 전체 높이를 `100dvh`로 배분합니다. 76px 헤더와 하단 스캐너 영역을 확보하고 남은 높이에 캐릭터와 서비스 카드 3개 행을 맞춥니다. 스크롤/클리핑으로 요소를 감추지 않습니다. 오른쪽 중복 시작 안내 버튼은 삭제했고, 메뉴 영역 터치로 깨우는 동작은 유지합니다.

회귀 검증: 로컬 서버를 실행한 뒤 `node scripts/haneuli-viewport-check.mjs`.
- 1366×768, 1280×720, 1280×600, 1440×900, 1920×1080, 1024×600, 1440×650
- 각 해상도 한국어/영어 × 대기/안내 = 28개 조합 통과
- 문서 가로·세로 스크롤 높이, 주요 영역 내부 넘침, 시작·번호 입력·이미지 스캔 버튼의 화면 내 위치 확인
- 중복 문구 없음, 브라우저 pageerror 없음
- 캡처와 검증 JSON은 `work/haneuli-viewport`에 저장. `CHROME_PATH`, `HANEULI_CHECK_URL`, `HANEULI_CAPTURE_DIR`로 로컬 환경 설정 가능
