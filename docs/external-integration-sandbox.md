# 기관·장비 연동 준비

현재 앱 DB 접수와 직원의 배정·처리·여객 상태 조회는 동작한다. 기관 접수 시스템, 로봇 및 이동지원 장비의 실제 API는 연결하지 않았다. 이 릴리스는 **자체 시험 중계 규격**만 구현하며 `live` 설정은 거부한다. 제조사·기관 API 규격으로 오해하지 않는다.

## 시험 설정

운영과 분리된 시험 프로젝트에서 합성 요청을 사용한다. 비용이 발생하는 서비스나 장비 명령을 연결하지 않는다. 환경 변수 값은 저장소에 넣지 않는다.

- `EXTERNAL_CONNECTION_MODE=sandbox`
- `EXTERNAL_ALLOWED_HOSTS`: 시험 중계 서버의 정확한 호스트 목록(쉼표 구분)
- `EXTERNAL_AGENCY_URL`, `EXTERNAL_ROBOT_URL`, `EXTERNAL_MOBILITY_URL`: HTTPS 접수 주소. 쿼리·사용자 인증이 포함된 URL은 거부
- 각 채널의 `_ADAPTER=jsp-gateway-v1`, `_TOKEN`(16자 이상), `_WEBHOOK_SECRET`(32자 이상)
- `EXTERNAL_RESOURCE_MAP`: 로컬 장비 UUID와 제조사 **시험** 장비 식별자의 JSON 매핑

기본은 미연결이다. 설정의 준비 상태는 `/staff/integrations`와 안내데스크 전용 `GET /api/staff/integrations`에서 확인한다. 주소·인증 값은 응답하지 않는다.

## 접수 → 시험 중계 → 상태 이벤트

1. 안내데스크 세션으로 `POST /api/staff/integrations`에 `{requestId, version, channel}`을 보낸다. channel은 agency/robot/mobility. 활성 요청의 현재 버전만 받는다. 장비 채널은 서비스 종류·배정 단계·장비 ID 매핑이 모두 일치해야 한다. 요청+채널은 한 번만 등록된다. 실패 후 다시 등록해도 기존 작업을 반환한다.
2. `GET /api/cron/integrations`를 기존 `CRON_SECRET` Bearer 인증으로 실행한다. 기본은 비활성이며, **자동 실행 일정은 추가하지 않았다.** 시험 환경 운영자가 명시적으로 실행한다.
3. 작업을 DB에서 원자적으로 선점한다. 네트워크/429/5xx는 지수 간격으로 최대 5회 시도한다. 응답을 잃어버려 재시도해도 `Idempotency-Key`는 같은 작업 UUID다. 중계 서버도 해당 키를 영속적으로 중복 처리 방지해야 한다. 네트워크 환경에서 exactly-once 실행은 보장하지 않는다.
4. 자체 요청 규격: `{contract:"jsp-gateway-v1",mode:"sandbox",jobId,channel,request:{id,service,topic,business,placeId,destinationId,party,lang,createdAt},resourceRef?}`. 영수증 토큰·등록 토큰·여객 메모·서비스 상세 자유 입력은 보내지 않는다. 취소·만료·장비 배차 변경 시 전송을 중단한다.
5. 시험 서버는 16KB 이내 JSON `{jobId,status:"accepted",externalId}`를 응답한다. externalId는 영문·숫자·`_.:-` 1~120자다. 단순 HTTP 성공만으로 접수 성공으로 기록하지 않는다. 알 수 없는 응답/4xx는 실패한다.
6. 시험 서버는 `POST /api/integrations/{channel}/events`에 `{jobId,externalId,status,sequence}`를 보낸다. status: in_progress/completed/failed/cancelled. sequence는 증가하는 양의 정수. `x-integration-timestamp`는 Unix 초, `x-integration-signature`는 `sha256=` + HMAC-SHA256(secret, timestamp + "." + 원본 JSON 바이트)의 hex다. 5분을 벗어난 서명·변조·다른 외부 ID를 거부한다. 16KB 제한, 중복/역순 및 종료 후 이벤트는 상태를 되돌리지 않는다.

시험 이벤트는 외부 시험 작업의 상태만 변경한다. 여객 요청의 완료·담당 변경·장비 출동으로 반영하지 않는다. 내부 요청 24시간 보존 기한에 외부 ID와 오류를 지우며, 부모 기록 삭제 시 대기열도 삭제한다.

## 실제 연결 전 필요한 자료

기관: API 명세, 접수·취소·결과 규격, 테스트 주소, 인증·권한, 중복 접수 규칙, 개인정보 전송 범위, 오류·타임아웃 정책.

장비: 제조사·모델, 시험 장비, 명령/상태 API, 지도·좌표계, 배터리·온라인·안전 정지 기준, 명령 취소 및 현장 수동 전환 방식. 장비 대장의 '가용'은 실제 텔레메트리가 아니다.

자료 수령 뒤 채널별 실제 어댑터·안전 정책·취소 프로토콜·상태 대사를 별도로 구현하고 현장 시험한다. 이 준비 코드는 실물 제어 인증이나 기관 접수 승인을 대신하지 않는다.

## 검증

`npx vitest run tests/external-integrations.test.ts`는 테스트 DB와 가짜 전송기로 중복, 재시도, 동시 선점, 잘못된 응답, 서명 이벤트, 역순, 여객 상태 분리, 보존 기한과 반복 마이그레이션을 확인한다. `scripts/staff-console-e2e.ts`는 로컬 환경에서 직원 화면과 기본 미연결 경계를 확인한다.
