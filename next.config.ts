import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버에서만 쓰는 DB 드라이버는 번들에 넣지 않는다.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // 초기 설정 경로가 실행 중에 읽는 파일. 적어 두지 않으면 배포 묶음에서 빠진다.
  outputFileTracingIncludes: {
    "/api/admin/setup": ["./db/schema.sql", "./db/seed-zones.json"],
  },
};

export default nextConfig;
