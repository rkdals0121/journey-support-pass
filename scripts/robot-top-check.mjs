import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const out='docs/design-before-after/robot-top';fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const path of ['/navigate?device=robot','/devices/robot','/help?topic=mobility&fresh=1'])for(const [w,h] of [[1366,768],[1080,1920],[390,844]])for(const scale of [1,1.5]){
  const p=await browser.newPage();await p.setViewport({width:w,height:h});await p.evaluateOnNewDocument(s=>sessionStorage.setItem('jsp:view',JSON.stringify({scale:s,voice:null,picture:null})),scale);
  await p.goto('http://127.0.0.1:3001'+path,{waitUntil:'networkidle2'});
  await p.waitForSelector('.public-header');
  const r=await p.evaluate(()=>{
   const R=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
   const header=document.querySelector('.public-header');return {header:R(header),content:R(document.querySelector('[aria-label="전체 화면 공항 지도"]')??document.querySelector('.task-home')??document.querySelector('[data-mobility-home]')),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,nav:getComputedStyle(document.querySelector('.public-nav')).display,targets:[...header.querySelectorAll('a,button')].filter(e=>e.getBoundingClientRect().height).map(R),circles:[...header.querySelectorAll('.text-size-control button')].map(R)};
  });
  assert.ok(r.overflow<=1);if(!path.startsWith('/help'))assert.equal(r.nav,'none');assert.ok(Math.abs(r.header.x-r.content.x)<2&&Math.abs(r.header.w-r.content.w)<2,'Header and content edges differ '+JSON.stringify(r));
  for(const b of r.targets)assert.ok(b.x>=r.header.x-1&&b.right<=r.header.right+1&&b.y>=r.header.y&&b.bottom<=r.header.bottom+1,'Header button escapes');
  for(const b of r.circles)assert.ok(Math.abs(b.w-b.h)<1,'Text size selection distorted');
  if(path.startsWith('/navigate'))assert.equal(await p.$$eval('[aria-label="지도 메뉴와 터미널"] button',es=>es.length),0,'Robot map toolbar toggle must be absent');
  await (await p.$('.public-header')).screenshot({path:out+`/header-${path.startsWith('/navigate')?'map':path.startsWith('/help')?'mobility':'demo'}-${w}-${scale}.png`});
  if(w===1080&&scale===1)await p.screenshot({path:out+`/${path.startsWith('/navigate')?'map':path.startsWith('/help')?'mobility':'demo'}-full.png`,fullPage:true});
  const menuVisible=await p.$eval('[aria-controls="public-nav"]',e=>e.getBoundingClientRect().height>0);
  if(menuVisible){await p.click('[aria-controls="public-nav"]');await p.waitForSelector('.public-nav.is-open',{visible:true});assert.equal(await p.$$eval('.public-nav.is-open a',es=>es.length),5);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1);await p.click('[aria-controls="public-nav"]');}
  if(path.startsWith('/help')){assert.equal(await p.$$eval('[data-mobility-action]',es=>es.length),4);assert.ok(await p.$eval('[data-mobility-home] .public-back',e=>e.getBoundingClientRect().y)>r.header.bottom,'Back link must be below the shared header');assert.equal(await p.$$eval('.pretrip-header',es=>es.length),0);}
  console.log(JSON.stringify({path,w,scale,ok:true}));await p.close();
 }
 const p=await browser.newPage();await p.setViewport({width:1080,height:1920});
 for(const url of ['/navigate?device=robot&lang=en','/devices/robot?lang=en']){await p.goto('http://127.0.0.1:3001'+url,{waitUntil:'networkidle2'});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1);await p.click('[aria-controls="public-nav"]');await p.waitForSelector('.public-nav.is-open',{visible:true});}
 const c=await browser.createBrowserContext(),k=await c.newPage();await k.setViewport({width:1024,height:768});await k.goto('http://127.0.0.1:3001/kiosk',{waitUntil:'networkidle2'});
 const z=JSON.parse(fs.readFileSync('db/seed-zones.json','utf8')).zones.find(z=>z.isKiosk);
 assert.equal(await k.evaluate(async x=>(await fetch('/api/kiosk/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(x)})).status,{code:z.code,placeId:'t1-info'}),200);
 await k.goto('http://127.0.0.1:3001/navigate?returnTo=%2Fkiosk%2Fguide',{waitUntil:'networkidle2'});
 assert.equal(await k.$$eval('[aria-label="지도 메뉴와 터미널"] button',es=>es.length),1);
 await k.click('[aria-label="메뉴 접기"]');assert.equal(await k.$$eval('[aria-label="지도 검색과 경로 설정"]',es=>es.length),0);
 await k.$eval('input[type=radio][value=robot]',e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;e.click()}).catch(async()=>{await k.goto('http://127.0.0.1:3001/navigate?device=robot&returnTo=%2Fkiosk%2Fguide',{waitUntil:'networkidle2'})});
 await k.waitForSelector('[data-device-layout=robot]');await k.waitForSelector('[aria-label="지도 검색과 경로 설정"]');assert.equal(await k.$$eval('[aria-label="지도 메뉴와 터미널"] button',es=>es.length),0);
 await (await k.$('.field-task-header')).screenshot({path:out+'/header-field-task.png'});
 console.log('18 viewport/text-size cases + 2 English pages; menu open/close, kiosk toggle retained, robot toggle removed, and robot panel restored passed.');
}finally{await browser.close()}
