import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버가 화면 구석에 띄우는 표시를 끈다. 화면 그림과 키오스크 시연에 끼어들지 않게 한다.
  devIndicators: false,
  // 개발 서버에서만 쓰인다. 개발 서버는 한동안 열지 않은 화면과 API 를 메모리에서 내렸다가 다음 요청 때 다시 만든다.
  // 느린 컴퓨터에서는 그 사이 10초 넘게 걸려, 화면의 요청 시간 제한(8~15초)에 걸려 화면 점검이 들쭉날쭉 실패한다.
  // 점검하는 동안 한 번 만든 것을 내리지 않게 한다. 운영 빌드에는 영향이 없다.
  onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 200 },
  // 서버에서만 쓰는 DB 드라이버는 번들에 넣지 않는다.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // 초기 설정 경로가 실행 중에 읽는 파일. 적어 두지 않으면 배포 묶음에서 빠진다.
  outputFileTracingIncludes: {
    "/api/admin/setup": ["./db/schema.sql", "./db/seed-zones.json"],
  },
  // 패스 QR 의 주소는 전부 대문자다(QR 을 작게 만들기 위해서). 대문자 /P/ 로 온 것을 /p/ 로 받아 준다.
  // 기기 점검 화면의 점검용 QR 도 같은 까닭으로 대문자(/CHECK)다. 휴대전화 기본 카메라로 찍어도 점검 화면이 열리게 한다.
  async rewrites() {
    return [
      { source: "/P/:token", destination: "/p/:token" },
      { source: "/CHECK", destination: "/check" },
    ];
  },
  async headers() {
    return [
      // 서비스 워커 파일은 휴대전화가 묵혀 두지 않고 매번 새로 확인하게 한다. 고친 것이 바로 퍼지게 하기 위해서다.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
      {
        source: "/(.*)",
        headers: [
          // 다른 사이트가 이 화면을 틀 안에 넣어 직원의 누름을 가로채지 못하게 한다.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 패스 QR 주소(/p/{token})가 다른 사이트로 넘어가는 요청에 실려 나가지 않게 한다.
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
