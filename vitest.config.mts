import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 120000, hookTimeout: 120000 },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
