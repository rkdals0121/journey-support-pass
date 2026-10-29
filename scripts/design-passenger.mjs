import fs from 'node:fs';
for(const f of ['src/app/error.tsx','src/app/not-found.tsx']){let s=fs.readFileSync(f,'utf8');s=s.replace(/<strong>(화면을 불러오지 못했습니다|찾는 화면이 없습니다)<\/strong>/g,'<h1>$1</h1>');fs.writeFileSync(f,s);}
const p='src/app/p/[token]/PassView.tsx';let s=fs.readFileSync(p,'utf8');s=s.replace('import { passUrl','import { passUrl');
if(!s.includes('from "@/lib/pass-format"'))s=s.replace('import Link from "next/link";','import Link from "next/link";\nimport { formatPassNo } from "@/lib/pass-format";');
s=s.replace('<h1>{t.passTitle}</h1>','<h1>{t.passTitle}</h1>\n      <dl className="pass-reference"><dt>{t.passNo}</dt><dd className="num">{formatPassNo(guide.passNo)}</dd></dl>');
fs.writeFileSync(p,s);
