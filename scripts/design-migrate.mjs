import fs from "node:fs";import path from "node:path";import postcss from "postcss";
const dir="src/app/styles";fs.mkdirSync(dir,{recursive:true});
const palette={
"canvas":"#F7F6F1","surface":"#FFFFFF","text":"#1E2B25","muted":"#5B6A62","line":"#E3E6E0","control-line":"#7C8A80",
"primary":"#2F5D46","primary-hover":"#234A38","primary-soft":"#E8EFEA","primary-faint":"#F0F4F0",
"accent":"#E9C46A","accent-soft":"#FBF3DC","accent-ink":"#5C4710","error":"#B23A2B","error-soft":"#FBECE9",
"dark":"#1E3329","on-dark":"#F7F6F1","on-dark-muted":"#CFDCD2","focus":"#7A5B21","overlay":"rgba(30,43,37,.48)","shadow":"rgba(30,43,37,.08)",
"blue":"#385774","blue-soft":"#EDF1F5","purple":"#675378","purple-soft":"#F0ECF3","rose":"#A54D62","rose-soft":"#F4E5E9",
"art-skin":"#E3C5A5","art-hair":"#5B4938","art-leaf":"#94AC95","machine-ink":"#000000","machine-paper":"#FFFFFF","transparent":"transparent"
};
const names=["globals.css","redesign.css","service-flow.css","staff-console.css","airport-design.css","booking.css","feedback-refinements.css","interface.css","task-experience.css"];
const sources=names.map(n=>fs.readFileSync("src/app/"+n,"utf8"));
const sourceTree=fs.readdirSync("src",{recursive:true}).map(String).filter(f=>/\.(tsx?|json)$/.test(f)).map(f=>fs.readFileSync(path.join("src",f),"utf8")).join("\n");
const dynamicPrefixes=[...sourceTree.matchAll(/["'`]([a-z][a-z0-9-]*-)["'`$]/g)].map(m=>m[1]);
function rgb(value){if(value.startsWith("#")){let h=value.slice(1);if(h.length===3)h=h.split("").map(x=>x+x).join("");return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}return value.match(/[\d.]+/g)?.slice(0,3).map(Number)??[0,0,0];}
function role(value,prop="",graphic=false){if(value.toLowerCase()==="transparent")return "transparent";if(/rgba/i.test(value)){const a=Number(value.match(/[\d.]+/g)?.[3]??1);if(a<.2)return "shadow";if(a<.8)return "overlay";}
const [r,g,b]=rgb(value),max=Math.max(r,g,b),min=Math.min(r,g,b),light=(max+min)/510,sat=max===min?0:(max-min)/(255-Math.abs(max+min-255));let hue=0;if(max!==min){hue=max===r?((g-b)/(max-min))%6:max===g?(b-r)/(max-min)+2:(r-g)/(max-min)+4;hue=(hue*60+360)%360;}
if(light>.98)return "surface";if(light<.08)return "text";
if(sat<.15){if(light>.94)return "canvas";if(light>.86)return "line";if(light>.55)return /border|outline|stroke/.test(prop)?"control-line":"muted";if(light>.25)return "muted";return "text";}
const text=/^color$|text-decoration-color/.test(prop),line=/border|outline|stroke/.test(prop);
if(hue>=28&&hue<78){if(light>.85)return "accent-soft";if(graphic&&hue<40&&light>.55)return "art-skin";return text||light<.45?"accent-ink":"accent";}
if(hue<28||hue>=345){if(light>.85)return "error-soft";return "error";}
if(hue>=78&&hue<175){if(light>.94)return "primary-faint";if(light>.8)return "primary-soft";if(line&&light>.48)return "control-line";if(light>.63)return graphic?"art-leaf":"muted";return light<.2?"dark":light<.31?"primary-hover":"primary";}
if(hue>=175&&hue<260){if(light>.82)return "blue-soft";return text||light<.6?"blue":"on-dark-muted";}
if(hue>=260&&hue<300)return light>.8?"purple-soft":"purple";
return light>.8?"rose-soft":"rose";
}
const colorRx=/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
function tokenColors(value,prop,graphic=false){return value.replace(colorRx,c=>`var(--color-${role(c,prop,graphic)})`).replace(/\bwhite\b/gi,"var(--color-surface)").replace(/\bblack\b/gi,"var(--color-text)");}
let tokens=":root {\n"+Object.entries(palette).map(([k,v])=>`  --color-${k}: ${v};`).join("\n")+"\n";
const aliases={ink:"dark","ink-2":"primary-hover","ink-soft":"primary",green:"primary","green-press":"primary-hover",mint:"primary-soft","mint-2":"primary-faint",sun:"accent","sun-press":"accent", "sun-soft":"accent-soft","sun-deep":"accent-ink",bg:"canvas",surface:"surface",line:"line","line-strong":"control-line",text:"text",muted:"muted",red:"error","red-bg":"error-soft",amber:"accent-ink","amber-bg":"accent-soft","ui-rule":"line","ui-muted":"muted"};
tokens+=Object.entries(aliases).map(([k,v])=>`  --${k}: var(--color-${v});`).join("\n");tokens+=`
  --font-body: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
  --font-num: var(--font-num-loaded), "Arial Narrow", sans-serif;
  --text-caption: .75rem; --text-small: .875rem; --text-body: 1rem; --text-heading: 1.25rem; --text-title: 1.75rem; --text-large: 2.5rem; --text-display: 3.5rem;
  --weight-body: 400; --weight-label: 600; --weight-heading: 700;
  --space-1: .25rem; --space-2: .5rem; --space-3: .75rem; --space-4: 1rem; --space-5: 1.5rem; --space-6: 2rem; --space-7: 3rem; --space-8: 4rem;
  --radius-small: .375rem; --radius-medium: .75rem; --radius-pill: 999rem;
  --radius: var(--radius-small); --radius-lg: var(--radius-medium);
  --shadow-1: 0 .125rem .5rem var(--color-shadow); --shadow-2: 0 .5rem 2rem var(--color-shadow);
  --motion-fast: 120ms; --motion-normal: 180ms; --motion-slow: 240ms; --ease-in: cubic-bezier(.4,0,1,1); --ease-out: cubic-bezier(0,0,.2,1);
  --nav-h: 4rem; --bar-h: 3.5rem; --col: 32.5rem;
}
@media (forced-colors: active) { :root { --color-primary: ButtonText; --color-text: CanvasText; --color-muted: CanvasText; --color-canvas: Canvas; --color-surface: Canvas; --color-line: CanvasText; --color-control-line: ButtonText; --color-focus: Highlight; } }
`;
fs.writeFileSync(dir+"/tokens.css",tokens);
const sheet=postcss.parse(sources.join("\n"));let pruned=0;sheet.walkComments(c=>c.remove());
sheet.walkRules(rule=>{if(rule.selector===":root"){rule.remove();return;}if(rule.parent.type==="atrule"&&/keyframes/.test(rule.parent.name))return;const selectors=postcss.list.comma(rule.selector).filter(sel=>{const classes=[...sel.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(m=>m[1]);return !classes.some(c=>!sourceTree.includes(c)&&!dynamicPrefixes.some(p=>c.startsWith(p)));});if(!selectors.length){rule.remove();pruned++;}else rule.selector=selectors.join(", ");});
sheet.walkDecls(d=>{d.value=tokenColors(d.value,d.prop);d.value=d.value.replace(/(-?[\d.]+)px\b/g,(_,n)=>Number(n)===0?"0":`${Number((Number(n)/16).toFixed(5))}rem`);if(d.prop==="font-size"&&/^[\d.]+rem$/.test(d.value)){const n=parseFloat(d.value),sizes=[.75,.875,1,1.25,1.75,2.5,3.5],labels=["caption","small","body","heading","title","large","display"];const nearest=sizes.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a);d.value=`var(--text-${labels[sizes.indexOf(nearest)]})`;}
if(d.prop==="font-weight"&&/^\d+$/.test(d.value)){d.value=Number(d.value)>=700?"var(--weight-heading)":Number(d.value)>=550?"var(--weight-label)":"var(--weight-body)";}
if(d.prop==="border-radius"&&/^[\d.]+rem$/.test(d.value)){const n=parseFloat(d.value);d.value=n>5?"var(--radius-pill)":n>.6?"var(--radius-medium)":"var(--radius-small)";}
if(/^(padding|margin|gap|row-gap|column-gap)(-|$)/.test(d.prop))d.value=d.value.replace(/(-?[\d.]+)rem/g,(_,n)=>`${Math.sign(Number(n))*Math.max(.25,Math.round(Math.abs(Number(n))*4)/4)}rem`);
});
// Collapse repeated identical selectors within the same condition. Most old overlays are exact repetitions.
const seen=new Map();let merged=0;sheet.walkRules(rule=>{if(rule.parent.type==="atrule"&&/keyframes/.test(rule.parent.name))return;const ancestors=[];for(let p=rule.parent;p&&p.type!=="root";p=p.parent)ancestors.unshift(p.name+":"+p.params);const key=ancestors.join("|")+"|"+rule.selector.replace(/\s+/g," ");const old=seen.get(key);if(old){const declarations=new Map();for(const node of [...old.nodes,...rule.nodes])if(node.type==="decl"){const prior=declarations.get(node.prop);if(!prior?.important||node.important)declarations.set(node.prop,node.clone());}rule.removeAll();for(const d of declarations.values())rule.append(d);old.remove();merged++;}seen.set(key,rule);});
function compact(root){return root.nodes.map(node=>{if(node.type==="rule")return node.selector+" { "+node.nodes.map(d=>d.toString()).join("; ")+"; }";if(node.type==="atrule"&&node.nodes)return `@${node.name} ${node.params} {\n${compact(node)}\n}`;return node.toString()+(node.type==="decl"?";":"");}).join("\n");}
fs.writeFileSync(dir+"/components.css","/* Canonical component and layout rules. Tokens are defined only in tokens.css. */\n"+compact(sheet)+"\n");
for(const f of ["src/app/components/support-journey.module.css","src/app/stamp/stamp.css"]){const root=postcss.parse(fs.readFileSync(f,"utf8"));root.walkDecls(d=>{d.value=tokenColors(d.value,d.prop);});fs.writeFileSync(f,root.toString());}
for(const name of names)fs.unlinkSync("src/app/"+name);
let layout=fs.readFileSync("src/app/layout.tsx","utf8");for(const name of names)layout=layout.replace(`import "./${name}";\n`,"");layout=layout.replace('import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";','import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";\nimport "./styles/tokens.css";\nimport "./styles/components.css";');fs.writeFileSync("src/app/layout.tsx",layout);
fs.writeFileSync("GPT 작업내역/2026-10-28_전면디자인/스타일_통합.json",JSON.stringify({originalBytes:sources.join("").length,newBytes:tokens.length+compact(sheet).length,prunedRules:pruned,mergedRules:merged},null,2));console.log({pruned,merged});
