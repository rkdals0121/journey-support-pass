# 하늘이 안내 키오스크

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
- `public/images/haneuli/hello.png`: 깨어서 인사하는 모습
- `public/images/haneuli/sleep.png`: 잠든 모습

### Final prompt — hello correction
Edit this mascot asset. Critical correction: the character is wearing YELLOW HEADPHONES over the BLUE helmet. The yellow patch on top must be a single continuous yellow headphone headband arch extending down BOTH sides all the way to the WHITE circular ear cups. Recolor the currently blue/lavender side headband strips yellow so the whole external headband is yellow, not only the top patch. Only the circular ear cups are white with cyan illuminated centers. Keep blue helmet face rim, blue airplane fin, yellow wrist cuffs, entire character identity, face, pose, tablet, dimensions, transparent background unchanged. No text.

### Final prompt — sleep
Create sleeping pose variant of this exact mascot web asset. Keep exact character identity, same full body size and centered framing, blue helmet and airplane fin, CONTINUOUS YELLOW HEADPHONE HEADBAND from top down both sides to white circular ear cups with cyan center, yellow wrist cuffs. Change expression to both eyes peacefully closed curved lines, mouth tiny contented smile; lower waving hand to gently rest on dark tablet held in lap, head slightly tilted asleep. Same soft plush 3D rendering. Transparent background. No letters, no Z symbols, no background, no extra objects.
