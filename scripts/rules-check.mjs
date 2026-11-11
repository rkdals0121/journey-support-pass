/**
 * 화면 규칙 점검 (AGENTS.md 2~4절 중 글자만 읽어서 셀 수 있는 것).
 * 규칙을 어긴 곳을 세어 scripts/rules-baseline.json 과 견준다. 늘어나면 실패한다(줄이는 방향으로만 간다).
 *
 *   node scripts/rules-check.mjs              지금 상태를 기준과 견준다(늘면 종료 1). CI 가 쓴다.
 *   node scripts/rules-check.mjs --report     규칙별·파일별 개수와 위치를 보여 준다.
 *   node scripts/rules-check.mjs --update     지금 상태를 새 기준으로 적는다(위반을 고쳐서 줄었을 때만).
 *
 * 세는 것: 색 코드, !important, overflow 숨김, 고정 px 너비·높이, 글자 크기의 px·vw, 정해진 값이 아닌 @media 크기,
 *   tokens.css 밖에서 색 토큰 다시 정하기, layout.tsx 에 새 CSS 파일 더하기.
 * 못 보는 것: 화면 모양 자체(layout-check, e2e 가 본다), 색 쓰임의 옳고 그름(노랑 강조 한 곳 등).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASELINE = path.join(import.meta.dirname, "rules-baseline.json");
const RULES = {
  hex: "색 코드(#…)를 직접 씀 (tokens.css 에만 둔다)",
  important: "!important 로 우선순위를 이김",
  overflow: "overflow: hidden/clip 으로 내용을 잘라 숨김",
  fixedPx: "고정 px 너비·높이 (2px 이하 선 두께 제외, rem 을 쓴다)",
  fontPx: "글자 크기를 px 로 정함 (rem·토큰을 쓴다)",
  fontVw: "글자 크기를 vw 로 정함 (글자 크기 설정이 안 먹는다)",
  breakpoint: "정해진 값(760·761·1100·1101, 높이 700·701)이 아닌 @media 크기",
  rootColor: "tokens.css 밖에서 색 토큰 값을 다시 정함",
};
const STD_W = new Set([760, 761, 1100, 1101]);
const STD_H = new Set([700, 701]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".css")) out.push(p);
  }
  return out;
}
/** 주석은 줄 수만 남기고 지운다. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;
const toPx = (n, unit) => (unit === "px" ? n : n * 16);

function scan(file) {
  const rel = path.relative(ROOT, file).replaceAll("\\", "/");
  const text = strip(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
  const found = [];
  const add = (rule, idx) => found.push({ rule, file: rel, line: lineOf(text, idx) });
  const isTokens = rel.endsWith("styles/tokens.css");
  if (!isTokens) for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)) {
    // 선택자의 #id 는 색이 아니다. 속성 값 자리(: 뒤, ; 앞)만 본다.
    const before = text.slice(Math.max(0, m.index - 80), m.index);
    if (/[:\s,(]\s*$/.test(before) && /:[^;{}]*$/.test(before)) add("hex", m.index);
  }
  for (const m of text.matchAll(/!important/g)) add("important", m.index);
  for (const m of text.matchAll(/overflow(?:-[xy])?\s*:\s*(?:hidden|clip)\b/g)) add("overflow", m.index);
  for (const m of text.matchAll(/(?<![\w(-])(?:min-|max-)?(?:width|height|inline-size|block-size)\s*:\s*([^;}{]+)/g)) {
    for (const v of m[1].matchAll(/(-?\d*\.?\d+)px/g)) if (Math.abs(parseFloat(v[1])) > 2) { add("fixedPx", m.index); break; }
  }
  for (const m of text.matchAll(/font-size\s*:\s*([^;}{]+)/g)) {
    if (/\d\s*px\b/.test(m[1])) add("fontPx", m.index);
    if (/\d\s*vw\b/.test(m[1])) add("fontVw", m.index);
  }
  for (const m of text.matchAll(/@media([^{]+)\{/g)) {
    for (const q of m[1].matchAll(/\((?:min|max)-(width|height)\s*:\s*(\d*\.?\d+)(px|rem|em)\)/g)) {
      const px = Math.round(toPx(parseFloat(q[2]), q[3]));
      if (!(q[1] === "width" ? STD_W : STD_H).has(px)) { add("breakpoint", m.index); break; }
    }
  }
  if (!isTokens) {
    for (const m of text.matchAll(/:root\s*\{([^}]*)\}/g)) {
      if (/--color-[\w-]+\s*:/.test(m[1])) add("rootColor", m.index);
    }
  }
  return found;
}

const files = walk(path.join(ROOT, "src"));
const all = files.flatMap(scan);
const counts = {}; // counts[rule][file] = n
for (const f of all) ((counts[f.rule] ??= {})[f.file] = (counts[f.rule][f.file] ?? 0) + 1);

// layout.tsx 의 CSS 가져오기 목록(덧칠 금지: 새 파일을 끝에 더하지 않는다)
const layoutSrc = fs.readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");
const imports = [...layoutSrc.matchAll(/import\s+"\.\/styles\/([\w-]+\.css)"/g)].map((m) => m[1]);

const mode = process.argv[2] ?? "";
if (mode === "--update") {
  fs.writeFileSync(BASELINE, JSON.stringify({ counts, imports }, null, 1) + "\n");
  console.log("기준을 새로 적었습니다:", Object.entries(counts).map(([r, f]) => `${r} ${Object.values(f).reduce((a, b) => a + b, 0)}`).join(", "));
  process.exit(0);
}
if (mode === "--report") {
  for (const [rule, desc] of Object.entries(RULES)) {
    const per = counts[rule] ?? {};
    const total = Object.values(per).reduce((a, b) => a + b, 0);
    console.log(`\n■ ${rule}: ${total}곳 — ${desc}`);
    for (const [f, n] of Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${String(n).padStart(4)}  ${f}`);
  }
  console.log(`\nlayout.tsx 의 CSS 파일 ${imports.length}개: ${imports.join(", ")}`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const worse = [];
const better = [];
for (const rule of Object.keys(RULES)) {
  const files2 = new Set([...Object.keys(counts[rule] ?? {}), ...Object.keys(base.counts[rule] ?? {})]);
  for (const f of files2) {
    const now = counts[rule]?.[f] ?? 0;
    const was = base.counts[rule]?.[f] ?? 0;
    if (now > was) worse.push({ rule, f, was, now });
    else if (now < was) better.push({ rule, f, was, now });
  }
}
const addedCss = imports.filter((i) => !base.imports.includes(i));
if (worse.length || addedCss.length) {
  console.error("화면 규칙 점검 실패: 기준보다 위반이 늘었습니다.\n");
  for (const w of worse) {
    console.error(`  ✗ [${w.rule}] ${w.f}: ${w.was} → ${w.now}  (${RULES[w.rule]})`);
    for (const x of all.filter((a) => a.rule === w.rule && a.file === w.f).slice(-(w.now - w.was))) console.error(`      ${x.file}:${x.line}`);
  }
  for (const c of addedCss) console.error(`  ✗ layout.tsx 에 새 CSS 파일 ${c} 를 더했습니다(AGENTS.md 4절: 앞 파일을 덮는 새 파일 금지).`);
  console.error("\n고칠 곳이 이미 있는 파일에서 규칙에 맞게 고쳐 주세요. 이유가 있으면 PR 설명에 적고 관리자와 정합니다.");
  process.exit(1);
}
const total = Object.values(counts).flatMap((f) => Object.values(f)).reduce((a, b) => a + b, 0);
console.log(`화면 규칙 점검 통과: 기준보다 늘어난 위반 없음 (지금 남은 위반 ${total}곳).`);
if (better.length) console.log(`  위반이 ${better.length}곳(파일·규칙 기준) 줄었습니다. node scripts/rules-check.mjs --update 로 기준을 낮춰 주세요.`);
