# 공항 지도 자료 출처 및 권리 확인 상태

이 문서는 사용 허가서 또는 재배포 라이선스가 아닙니다.

## 공식 지도에서 추출한 자료 — 공개 재배포 허가 미확인

- 원본 페이지: https://www.airport.kr/geomap/ap_ko/view.do
- 수집 경로: 사용자가 제공한 2026-10-28 HAR에 포함된 응답 자료
- `assets/airport-engine.js`: 공식 페이지의 WebNavigation 클라이언트 번들. 지도 렌더링 API를 노출하도록 내보내기를 수정했습니다. 원본 전체가 자체 개발 코드인 것은 아닙니다.
- `data/building-*-3f.geojson`: 해당 응답에서 추출한 3층 도면
- `data/airport.json`: 해당 응답에서 정리한 시설 791개 및 통로 노드·연결 정보
- `assets`의 시설 PNG/SVG 아이콘: 해당 지도 응답의 아이콘 자료

페이지에 공개되어 있었다는 사실이나 HAR로 내려받았다는 사실은 재배포 허가의 근거가 아닙니다. 현재 권리자·서비스 제공자의 공개 재배포 허락을 확인하지 못했습니다. 공식 이용 조건 또는 별도 허가를 확인한 뒤 공개 배포 여부를 결정해야 합니다. 허가가 확인되지 않으면 이 엔진·도면·아이콘을 이용 가능한 대체 자료로 교체해야 합니다.

## 다른 출처

- `assets/journey-robot.svg`: 팀원 Journey Support Pass의 `/devices` 캐릭터를 참조·추출한 자료. 팀 내 이용 범위를 확인해야 합니다.
- `assets/react.production.min.js`, `assets/react-dom.production.min.js`: React / ReactDOM 배포 번들. 파일의 라이선스 주석을 유지합니다. 이들 라이브러리의 조건이 공항 엔진·도면에 적용되는 것은 아닙니다.

## 직접 작성한 연결 코드

`map.js`, `graph.js`, `map.css`, `index.html`, `components/AirportMap.tsx`는 지도 표시·경로 계산·상위 화면 연결을 위해 작성한 코드입니다. 이 코드와 함께 제공된다는 이유로 제3자 자료의 이용 권한이 새로 부여되지 않습니다.

HAR 요청 헤더·쿠키·인증 값은 이 지도 모듈에 포함하지 않았습니다.
