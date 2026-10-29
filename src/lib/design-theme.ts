/**
 * Metadata needs a resolved colour, unlike CSS/SVG. tokens.css remains the source.
 * 값은 여기 직접 적는다. 서버에서 tokens.css 파일을 읽으면 배포본에는 그 파일이 없어 모든 화면이 500이 된다.
 * 두 곳이 어긋나지 않게 tests/design-theme.test.ts 가 tokens.css 와 견준다.
 */
export const DESIGN_COLORS = {
  canvas: "#F7F6F1",
  primary: "#2F5D46",
} as const;

export function designColor(name: keyof typeof DESIGN_COLORS) {
  return DESIGN_COLORS[name];
}
