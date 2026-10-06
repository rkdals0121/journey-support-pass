import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버에서만 쓰는 DB 드라이버는 번들에 넣지 않는다.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // 초기 설정 경로가 실행 중에 읽는 파일. 적어 두지 않으면 배포 묶음에서 빠진다.
  outputFileTracingIncludes: {
    "/api/admin/setup": ["./db/schema.sql", "./db/seed-zones.json"],
  },
  async headers() {
    return [
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
