import fs from "node:fs";
const source=fs.readFileSync("src/app/styles/tokens.css","utf8");const colors=Object.fromEntries([...source.matchAll(/--color-([a-z-]+):\s*(#[a-f0-9]{6})/gi)].map(m=>[m[1],m[2]]));
function l(hex){const a=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
const pairs=[["text","canvas"],["text","surface"],["muted","canvas"],["muted","surface"],["surface","primary"],["surface","primary-hover"],["primary-hover","primary-soft"],["accent-ink","accent"],["accent-ink","accent-soft"],["error","error-soft"],["on-dark","dark"],["on-dark-muted","dark"],["blue","blue-soft"],["purple","purple-soft"],["rose","rose-soft"]];
const rows=pairs.map(([fg,bg])=>{const a=l(colors[fg]),b=l(colors[bg]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);return {fg,bg,ratio:Number(ratio.toFixed(2)),pass:ratio>=4.5};});
fs.writeFileSync("docs/design-contrast.json",JSON.stringify(rows,null,2));console.log(rows);if(rows.some(r=>!r.pass))process.exitCode=1;
