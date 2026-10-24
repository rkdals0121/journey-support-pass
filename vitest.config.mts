import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 120000, hookTimeout: 120000 },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // tsconfig 의 jsx 는 Next.js 가 맡도록 "preserve" 다. 검사에서 화면 부품(.tsx)을 가져올 때는 여기서 바꾼다.
  // 이것이 없으면 GuideParts.tsx 를 가져오는 tests/guide.test.ts 가 읽히지 않는다.
  oxc: { jsx: { runtime: "automatic" } },
});
