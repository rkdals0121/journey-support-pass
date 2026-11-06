// Run against a local server: CHROME_PATH=... ROBOT_MAP_BASE=http://localhost:3001 node scripts/robot-map-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base=process.env.ROBOT_MAP_BASE??'http://localhost:3001';
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
const chrome=process.env.CHROME_PATH;
assert.ok(chrome,'Set CHROME_PATH to the local Chrome executable');
const out=path.resolve('docs/design-before-after/robot-group');fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
 const context=await browser.createBrowserContext();const setup=await context.newPage();
 await setup.goto(base+'/kiosk',{waitUntil:'networkidle2',timeout:120000});
 const seed=JSON.parse(fs.readFileSync('db/seed-zones.json','utf8')).zones.find(z=>z.isKiosk);
 const status=await setup.evaluate(async data=>(await fetch('/api/kiosk/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).status,{code:seed.code,placeId:'t1-info'});
 assert.equal(status,200,'Local device setup');await setup.close();
 for(const [device,width,height] of [['kiosk',1920,1080],['accessible',1024,768],['robot',1080,1920],['robot-preview',1366,768],['robot-public',1366,768],['robot-public-phone',390,844],['robot-tablet',1024,768],['robot-phone',390,844],['mobility-robot',1080,1920]])for(const scale of [1,1.5]){
  if(process.env.ROBOT_MAP_ONLY&&!process.env.ROBOT_MAP_ONLY.split(',').includes(device))continue;
  const robot=device.includes('robot');const page=device.startsWith('robot-public')?await browser.newPage():await context.newPage();await page.setViewport({width,height});
  await page.evaluateOnNewDocument(s=>sessionStorage.setItem('jsp:view',JSON.stringify({scale:s,voice:null,picture:null})),scale);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+(device==='mobility-robot'?'/help?topic=mobility&flow=robot&fresh=1&returnTo=%2Fkiosk%2Fguide':'/navigate?returnTo=%2Fkiosk%2Fguide'+(robot?'&device=robot':'')),{waitUntil:'networkidle2',timeout:120000});
  await page.waitForSelector('[aria-label="전체 화면 공항 지도"]');
  await page.evaluate(()=>document.getAnimations().forEach(a=>{if(a.effect?.getTiming().iterations!==Infinity)a.finish()}));
  const metrics=await page.evaluate(()=>{
   const R=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
   const frame=document.querySelector('[class*="_fullscreen_"]'),panel=frame.querySelector('[class*="_sidePanel_"]'),viewport=frame.querySelector('[class*="_mapBackground_"]');
   const header=document.querySelector('.field-task-header,.public-header');const box=header.getBoundingClientRect();
   const headerVisible=header.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2));
   const targets=[...panel.querySelectorAll('button,summary,input[type=search]')].filter(e=>e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden').map(e=>({label:e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.textContent.trim(),height:e.getBoundingClientRect().height}));
   const group=header.querySelector('.text-size-control');
   const textSize=group?{group:R(group),buttons:[...group.querySelectorAll('button')].map(R)}:null;
   const footer=panel.querySelector('[class*="_panelFooter_"]');
   return {textSize,canvas:R(frame.closest('[data-device-layout=robot]')?.parentElement?.closest('[data-device-layout=robot]')??frame),frame:R(frame),panel:R(panel),map:R(viewport),pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,panelOverflow:panel.scrollWidth-panel.clientWidth,panelScroll:panel.scrollHeight-panel.clientHeight,docScroll:document.documentElement.scrollHeight-innerHeight,headerVisible,headerOverflow:header.scrollWidth-header.clientWidth,targets,header:R(header),footer:R(footer),zoom:getComputedStyle(panel.querySelector('[class*="_panelTop_"]')).zoom};
  });
  assert.equal(errors.length,0,errors.join('\n'));assert.ok(metrics.pageOverflow<=1,`${device} page horizontal overflow`);assert.ok(metrics.panelOverflow<=1,`${device} panel horizontal overflow`);assert.ok(metrics.headerVisible,`${device} header covered`);assert.ok(metrics.headerOverflow<=1,`${device} header overflow`);
  if(metrics.textSize){const {group,buttons}=metrics.textSize;for(const b of buttons){assert.ok(Math.abs(b.w-b.h)<1,'Text-size selection must stay circular');assert.ok(b.x>=group.x&&b.y>=group.y&&b.right<=group.right+1&&b.bottom<=group.bottom+1,'Text-size selection escapes its group');}}
  if(robot){assert.ok(Math.abs(metrics.frame.w-metrics.header.w)<2,'Robot header width differs from map '+JSON.stringify({frame:metrics.frame,header:metrics.header}));assert.ok(Math.abs(metrics.frame.x-metrics.header.x)<2,'Robot header does not align with map '+JSON.stringify({frame:metrics.frame,header:metrics.header}));assert.ok(metrics.canvas.h>metrics.canvas.w,'Robot document must stay portrait');assert.equal(metrics.panelScroll,0,'Robot controls must scroll with the document');assert.ok(metrics.map.bottom<=metrics.panel.y+1,'Map overlaps panel');assert.equal(Number(metrics.zoom),1);assert.ok(metrics.targets.every(t=>t.height>=63.5),'Robot touch target below 64px: '+JSON.stringify(metrics.targets.filter(t=>t.height<63.5)));}
  if(device.startsWith('robot-public'))await (await page.$('.public-header')).screenshot({path:path.join(out,`header-${device}-${scale}.png`)});
  if(scale===1){await page.screenshot({path:path.join(out,`after-${device}.png`),fullPage:robot});}
  results.push({device,width,height,scale,...metrics});console.log(JSON.stringify({device,width,height,scale,scroll:metrics.panelScroll,ok:true}));await page.close();
 }
 const report=await browser.newPage();
 for(const width of [390,1366])for(const scale of [1,1.5])for(const task of ['cleaning','facility-access','facility-inspection']){
  await report.setViewport({width,height:width===390?844:900});
  await report.evaluateOnNewDocument(s=>sessionStorage.setItem('jsp:view',JSON.stringify({scale:s,voice:null,picture:null})),scale);
  await report.goto(base+'/help?topic=facility&task='+task+'&fresh=1',{waitUntil:'networkidle2',timeout:120000});
  await report.waitForSelector('.service-task-fields input');
  const boxes=await report.$$eval('.service-task-fields>div>input,.service-task-fields>div>select',es=>es.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,h:r.height,b:r.bottom}}));
  assert.ok(boxes.length>=2);assert.ok(Math.abs(boxes[0].h-boxes[1].h)<1,'Facility field heights differ');
  if(width>760)assert.ok(Math.abs(boxes[0].y-boxes[1].y)<1,'Facility field tops differ');
  assert.ok(await report.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1,'Facility page horizontal overflow');
  if(width===1366&&scale===1)await report.screenshot({path:path.join(out,'facility-'+task+'.png'),fullPage:true});
 }
 await report.close();console.log('Facility input heights and alignment passed: 12 task/viewport/text-size cases.');
 const before=JSON.parse(fs.readFileSync(path.join(out,'before-metrics.json'),'utf8'));
 for(const i of [0,1]){const item=results.find(r=>r.device===(i===0?'kiosk':'accessible')&&r.scale===1);if(!item)continue;for(const key of ['w','h','x','y'])assert.ok(Math.abs(item.frame[key]-before[i].map[key])<1,'Kiosk frame changed');for(const key of ['h','x','y'])assert.ok(Math.abs(item.panel[key]-before[i].panel[key])<1,'Kiosk panel geometry changed');assert.ok(item.panel.w<before[i].panel.w&&item.panel.w>=before[i].panel.w*.8,'Kiosk controls should be moderately narrower');}
 const page=await context.newPage();await page.setViewport({width:1366,height:900});await page.goto(base+'/navigate?returnTo=%2Fkiosk%2Fguide',{waitUntil:'networkidle2',timeout:120000});
 await page.type('input[type=search]','안내데스크');await page.waitForSelector('[aria-label="검색 결과"] button');
 await page.evaluate(()=>{const button=[...document.querySelectorAll('[aria-label="검색 결과"] button')].find(e=>e.textContent.includes('일반지역'));assertButton(button);function assertButton(b){if(!b)throw Error('Start facility missing');b.click();}});
 await page.$eval('input[type=search]',e=>{e.value='';e.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.click('input[type=search]',{clickCount:3});await page.keyboard.press('Backspace');await page.type('input[type=search]','화장실');await page.waitForSelector('[aria-label="검색 결과"] button');await page.click('[aria-label="검색 결과"] button');
 await page.waitForSelector('[aria-label="경로 결과"]',{timeout:30000});
 const endpoints=()=>page.$$eval('[class*="_startControl_"] strong,[class*="_destinationControl_"] strong',es=>es.map(e=>e.textContent));const names=await endpoints();
 for(const device of ['robot','kiosk']){
  await page.$eval(`input[type=radio][value=${device}]`,e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;e.click();});
  await page.waitForFunction(d=>document.querySelector('[class*="_fullscreen_"]').dataset.deviceLayout===d,{},device);assert.deepEqual(await endpoints(),names,'Device switch lost endpoints');await page.waitForSelector('[aria-label="경로 결과"]');
  if(device==='robot'){
   await page.click('button[aria-label="출발지와 목적지 바꾸기"]');assert.deepEqual(await endpoints(),[...names].reverse());await page.click('button[aria-label="출발지와 목적지 바꾸기"]');
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='안내 시작'));
   await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='안내 시작');if(!b)throw Error('Robot start action missing');b.click()});
   await page.waitForFunction(()=>document.body.textContent.includes('목적지 도착 확인(시연)'));await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='목적지 도착 확인(시연)').click());
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='안내 종료'));await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='안내 종료').click());
  }
 }
 await page.click('button[aria-label="출발지와 목적지 다시 설정"]');await page.waitForFunction(()=>document.querySelector('[class*="_startControl_"] strong')?.textContent==='출발지 선택'&&document.querySelector('[class*="_destinationControl_"] strong')?.textContent==='목적지 선택');
 const services=await context.newPage();await services.setViewport({width:1366,height:768});
 for(const lang of ['ko','en']){
  await services.goto(base+'/services'+(lang==='en'?'?lang=en':''),{waitUntil:'networkidle2',timeout:120000});
  const verify=async()=>{await services.waitForFunction(()=>{
   const text=document.querySelector('.service-directory-toolbar>span[role=status]')?.textContent??'';
   return Number(text.match(/\d+/)?.[0])===document.querySelectorAll('.service-directory-grid>.task-action').length;
  });};
  await verify();assert.equal(await services.$$eval('.service-directory-grid>.task-action',es=>es.length),9);
  if(lang==='ko')await services.screenshot({path:path.join(out,'services-notebook.png')});
  await services.$eval('.service-directory-filter',e=>e.open=true);
  for(const label of lang==='en'?['Support','Simulation','Reports','All']:['도움 요청','모의 체험','신고·업무 접수','전체']){
   await services.$$eval('.public-filter button',(es,label)=>es.find(e=>e.textContent.trim()===label).click(),label);await verify();
  }
  await services.type('#service-search','zzznomatchingservice');await verify();
  assert.equal(await services.$$eval('.service-directory-grid>.task-action',es=>es.length),3,'Portal cards remain visible when the search has no matching catalog cards');
 }
 await services.setViewport({width:390,height:844});await services.goto(base+'/services',{waitUntil:'networkidle2',timeout:120000});await services.screenshot({path:path.join(out,'services-phone.png')});
 console.log('Service count matches rendered cards in Korean/English, filters and searches.');
 fs.writeFileSync(path.join(out,'after-metrics.json'),JSON.stringify(results,null,2));console.log('Kiosk frame preserved with narrower controls; route, device switch, swap, robot arrival/end and reset passed.');
}finally{await browser.close()}
