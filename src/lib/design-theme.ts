/** Metadata needs a resolved colour, unlike CSS/SVG. tokens.css remains the source. */
import { readFileSync } from "node:fs";
import path from "node:path";
const source = readFileSync(
  path.join(process.cwd(), "src/app/styles/tokens.css"),
  "utf8",
);
export function designColor(name: "canvas" | "primary") {
  const value = source.match(
    new RegExp("--color-" + name + ":\\s*([^;]+)"),
  )?.[1];
  if (!value) throw new Error("Missing design token: " + name);
  return value;
}
