/**
 * 만남 장소(service-hubs)마다 실제 공항 실내지도에서 표시할 시설(지도 자료 id).
 * 서버·화면 양쪽에서 쓰므로 "use client" 파일에 두지 않는다(서버 화면에서 부르면 500 이 났다).
 * 116번 탑승구 앞(탑승동 중앙)은 지도 자료에 없어 같은 자리의 탑승동 3층 중앙 안내데스크로 표시한다.
 */
export const HUB_POI: Record<string, number> = {
  "t1-departure": 36044, // T1 3층 일반지역 중앙 안내데스크(8번 출입구 부근)
  "t1-care": 33635, // T1 장애인 안심여행센터
  "t1-airside": 34504, // T1 탑승구 25
  concourse: 36041, // 탑승동 3층 중앙 안내데스크
  "t2-departure": 36036, // T2 3층 일반지역 안내데스크
  "t2-airside": 36039, // T2 면세지역 250번 게이트 부근 안내데스크
};

export function hubHasLiveMap(hubId: string) {
  return hubId in HUB_POI;
}
