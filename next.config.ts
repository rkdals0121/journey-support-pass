import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버에서만 쓰는 DB 드라이버는 번들에 넣지 않는다.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
