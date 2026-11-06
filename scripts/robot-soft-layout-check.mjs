import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const out='docs/design-before-after/robot-group';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const c=await browser.createBrowserContext(),p=await c.newPage();
 await p.setViewport({width:1024,height:768});await p.goto('http://127.0.0.1:3001/kiosk',{waitUntil:'networkidle2'});
 const z=JSON.parse(fs.readFileSync('db/seed-zones.json','utf8')).zones.find(z=>z.isKiosk);
 assert.equal(await p.evaluate(async x=>(await fetch('/api/kiosk/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(x)})).status,{code:z.code,placeId:'t1-info'}),200);
 await p.goto('http://127.0.0.1:3001/navigate?returnTo=%2Fkiosk%2Fguide',{waitUntil:'networkidle2'});
 const f=await p.$('[class*="_sidePanel_"] [class*="_filters_"]');
 await f.scrollIntoView();
 const b=await f.evaluate(e=>{const i=[...e.querySelectorAll('button')].find(x=>x.textContent.includes('안내데스크')).getBoundingClientRect(),m=e.querySelector('summary').getBoundingClientRect();return {iy:i.y,my:m.y,ir:i.right,mx:m.x}});
 console.log('Kiosk filter positions',JSON.stringify(b));await f.screenshot({path:out+'/kiosk-facilities.png'});
 assert.ok(Math.abs(b.iy-b.my)<1&&b.mx>=b.ir,'Other facilities must sit beside information');
 await f.screenshot({path:out+'/kiosk-facilities.png'});
 await p.$eval('[class*="_moreFacilities_"]',e=>e.open=true);
 assert.ok(await f.evaluate(e=>Math.abs(e.getBoundingClientRect().width-e.querySelector('details').getBoundingClientRect().width))<2,'Expanded facilities should span both columns');
 await p.setViewport({width:1366,height:768});await p.goto('http://127.0.0.1:3001/navigate?device=robot&returnTo=%2Fkiosk%2Fguide',{waitUntil:'networkidle2'});

 const geometry=await p.evaluate(()=>{const frame=document.querySelector('[aria-label="전체 화면 공항 지도"]').getBoundingClientRect(),map=document.querySelector('[class*="_mapBackground_"]').getBoundingClientRect(),heading=document.querySelector('[class*="_panelHeading_"]'),title=heading.querySelector('h1').getBoundingClientRect(),voice=heading.querySelector('button[aria-label="소리로 듣기"]');const r=voice.getBoundingClientRect();return {inset:map.x-frame.x,right:frame.right-map.right,titleCenter:title.y+title.height/2,voiceCenter:r.y+r.height/2,w:r.width,h:r.height,icon:voice.querySelector('span').className,inside:!!voice.closest('header')}});
 assert.ok(geometry.inset>=20&&geometry.right>=20,'Map needs a white inset on both sides');assert.ok(geometry.inside&&geometry.icon==='sr-only','Voice action must be an icon inside the title');assert.ok(Math.abs(geometry.w-geometry.h)<1&&geometry.h>=64,'Voice icon needs a circular touch target');assert.ok(Math.abs(geometry.titleCenter-geometry.voiceCenter)<1,'Title and icon must share their vertical center');
 await p.waitForFunction(()=>!document.querySelector('button[aria-label="소리로 듣기"]').disabled);
 await p.click('button[aria-label="소리로 듣기"]');await p.waitForSelector('button[aria-label="소리 안내 끄기"]');await p.click('button[aria-label="소리 안내 끄기"]');
 const order=await p.evaluate(()=>[document.querySelector('[class*="_startControl_"]'),document.querySelector('[class*="_swap_"]'),document.querySelector('[class*="_destinationControl_"]>button'),document.querySelector('[class*="_destinationChange_"]')].map(e=>e.getBoundingClientRect().x));
 assert.ok(order.every((v,i)=>!i||v>order[i-1]),'Start/swap/destination/reset order');
 await p.$eval('[class*="_moreFacilities_"]',e=>e.open=true);
 assert.equal(await p.$eval('[class*="_sidePanel_"]',e=>e.scrollHeight-e.clientHeight),0,'Expanded robot facilities must not introduce an internal scroll');
 await p.evaluate(()=>window.scrollTo(0,400));
 assert.ok(await p.evaluate(()=>scrollY)>300,'The whole document must scroll');
 assert.equal(await p.$eval('[class*="_sidePanel_"]',e=>e.scrollTop),0);
 await p.$eval('[class*="_moreFacilities_"]',e=>e.open=false);
 await p.evaluate(()=>window.scrollTo(0,0));
 const clip=await p.evaluate(()=>{const r=document.querySelector('[class*="_sidePanel_"]').getBoundingClientRect(),f=document.querySelector('[class*="_panelFooter_"]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:f.bottom-r.y+32}});
 await p.screenshot({path:out+'/robot-controls.png',clip,captureBeyondViewport:true});
 console.log('Kiosk adjacent/expanded facilities, endpoint ordering, and whole-document scrolling, inset map, and centered icon voice action passed.');
}finally{await browser.close()}
