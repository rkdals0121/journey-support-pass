import fs from 'node:fs';import postcss from 'postcss';
for(const file of fs.readdirSync('src/app/styles').filter(f=>f.endsWith('.css')&&f!=='tokens.css').map(f=>'src/app/styles/'+f)){const root=postcss.parse(fs.readFileSync(file,'utf8'));const media=root.nodes.filter(n=>n.type==='atrule'&&n.name==='media');for(const n of media){n.remove();root.append(n);}fs.writeFileSync(file,root.toString());}
