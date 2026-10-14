import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버가 화면 구석에 띄우는 표시를 끈다. 화면 그림과 키오스크 시연에 끼어들지 않게 한다.
  devIndicators: false,
  // 서버에서만 쓰는 DB 드라이버는 번들에 넣지 않는다.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // 초기 설정 경로가 실행 중에 읽는 파일. 적어 두지 않으면 배포 묶음에서 빠진다.
  outputFileTracingIncludes: {
    "/api/admin/setup": ["./db/schema.sql", "./db/seed-zones.json"],
  },
  // 패스 QR 의 주소는 전부 대문자다(QR 을 작게 만들기 위해서). 대문자 /P/ 로 온 것을 /p/ 로 받아 준다.
  async rewrites() {
    return [{ source: "/P/:token", destination: "/p/:token" }];
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
