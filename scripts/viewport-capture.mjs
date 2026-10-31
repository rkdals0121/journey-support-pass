import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base=process.env.VIEWPORT_BASE??'http://127.0.0.1:3170';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local verification only');
const out=path.resolve('GPT 작업내역/2026-10-30_첫화면_배치/final');fs.mkdirSync(out,{recursive:true});
const cases=[
 ['/help',1280,633,1],['/help',1366,657,1],['/help',1920,937,1],
 ['/help',390,844,1],['/help',320,640,1.5],['/help',768,1024,1.5],['/help',1280,633,1.5],
 ['/visits',1280,633,1],['/services',1280,633,1],['/navigate',1280,633,1],
 ['/help?lang=en',1280,633,1],
 ['/help?returnTo=/kiosk/guide',1280,800,1,true],['/help?returnTo=/kiosk/guide',1080,1920,1.5,true],
];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const rows=[];
try{
 const z=JSON.parse(fs.readFileSync('db/seed-zones.json','utf8')).zones.find(z=>z.isKiosk);
 const login=await fetch(base+'/api/kiosk/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:z.code,placeId:'cc-center'})});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 for(const [route,width,height,scale,kiosk]of cases){
  const page=await browser.newPage();await page.setViewport({width,height});
  await page.evaluateOnNewDocument(s=>sessionStorage.setItem('jsp:view',JSON.stringify({scale:s,voice:null,picture:null})),scale);
  if(kiosk){const [name,...value]=cookie.split('=');await page.setCookie({name,value:value.join('='),url:base,httpOnly:true})}
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(base+route,{waitUntil:'networkidle0',timeout:90000});await page.waitForSelector('h1');await page.evaluate(()=>document.fonts.ready);
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,documentHeight:document.documentElement.scrollHeight,fontSize:getComputedStyle(document.documentElement).fontSize,targets:[...document.querySelectorAll(".request-shared .request-service-options label,.request-shared .request-task-options label,.request-shared [data-request-next]")].filter(e=>e.getBoundingClientRect().height).map(e=>e.getBoundingClientRect().height),fields:[...document.querySelectorAll('.service-task-fields input,.service-task-fields textarea')].filter(e=>e.getBoundingClientRect().height).map(e=>({id:e.id,bottom:e.getBoundingClientRect().bottom})),next:[...document.querySelectorAll('[data-request-next],.navigation-form > button[type=submit]')].filter(e=>e.getBoundingClientRect().height).map(e=>({bottom:e.getBoundingClientRect().bottom,top:e.getBoundingClientRect().top}))}));
  assert.equal(response.status(),200);assert.equal(metrics.overflow,false,route+' overflow '+width+' scale '+scale);assert.deepEqual(errors,[]);
  if(kiosk)assert(metrics.targets.length>0&&metrics.targets.every(h=>h>=64),'Kiosk target below 64px');
  if(route==='/help'&&width>=1280&&scale===1){assert(metrics.fields.every(f=>f.bottom<height-64),'Current fields below fold');assert(metrics.next.every(b=>b.top>=0&&b.bottom<=height),'Next button below fold')}
  const file=`${kiosk?'kiosk-':''}${route.includes('lang=en')?'en-':''}${route.split('?')[0].slice(1)}-${width}-${scale}.png`;
  await page.screenshot({path:path.join(out,file)});rows.push({route,width,height,scale,kiosk:!!kiosk,status:response.status(),errors,...metrics,file});await page.close();
 }
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(rows,null,2));console.log('Verified '+rows.length+' viewport states');
}finally{await browser.close()}
