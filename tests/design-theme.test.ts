import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DESIGN_COLORS } from "@/lib/design-theme";

describe("메타데이터 색", () => {
  it("tokens.css 의 값과 같다", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/styles/tokens.css"), "utf8");
    for (const [name, value] of Object.entries(DESIGN_COLORS)) {
      expect(css.match(new RegExp(`--color-${name}:\s*([^;]+);`))?.[1].trim(), name).toBe(value);
    }
  });
});
