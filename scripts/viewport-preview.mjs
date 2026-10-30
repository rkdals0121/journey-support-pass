import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base=process.env.DESIGN_PREVIEW_BASE;
const share=process.env.DESIGN_PREVIEW_SHARE_URL;
if(!base||!share||new URL(base).protocol!=='https:'||!new URL(base).hostname.endsWith('.vercel.app'))throw Error('Authenticated Vercel preview required');
const out=path.resolve('GPT 작업내역/2026-10-30_첫화면_배치/preview-pages');fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const rows=[];
try{
 const p=await browser.newPage();await p.goto(share,{waitUntil:'networkidle2',timeout:90000});
 const cases=['/help','/navigate','/visits','/services'].flatMap(route=>[1280,1920].map(width=>({route,width,scale:1}))).concat([320,390,768,1280,1366,1920].flatMap(width=>[1,1.5].map(scale=>({route:'/',width,scale})))).concat([320,390,768].flatMap(width=>[1,1.5].map(scale=>({route:'/services',width,scale}))));
 for(const {route,width,scale} of cases){
  const height=width===1280?633:width===1366?657:width===1920?937:width===768?1024:width===390?844:640;await p.setViewport({width,height});
  await p.evaluate(s=>sessionStorage.setItem('jsp:view',JSON.stringify({scale:s,voice:null,picture:null})),scale);const errors=[];const onError=e=>errors.push(e.message);p.on('pageerror',onError);
  const r=await p.goto(base+route,{waitUntil:'networkidle2',timeout:90000});await p.waitForSelector('h1');await p.evaluate(()=>document.fonts.ready);
  const info=await p.evaluate(()=>({heading:document.querySelector('h1')?.textContent,documentHeight:document.documentElement.scrollHeight,gridColumns:document.querySelector('.airport-service-grid')?getComputedStyle(document.querySelector('.airport-service-grid')).gridTemplateColumns.split(' ').length:null,overflow:document.documentElement.scrollWidth>innerWidth+1,fields:[...document.querySelectorAll('.service-task-fields input')].filter(e=>e.getBoundingClientRect().height).map(e=>e.getBoundingClientRect().bottom),next:[...document.querySelectorAll('[data-request-next]')].filter(e=>e.getBoundingClientRect().height).map(e=>e.getBoundingClientRect().bottom)}));
  assert.equal(r.status(),200);assert.equal(new URL(p.url()).origin,new URL(base).origin);assert.equal(new URL(p.url()).pathname,route);assert.deepEqual(errors,[]);assert.equal(info.overflow,false);
  if(route==='/'&&width>=1101&&scale===1)assert(info.documentHeight<=height+1,'Home below viewport');
  if(route==='/services')assert.equal(info.gridColumns,width<=760?1:width<=1100?2:3);
  if(route==='/help'){assert(info.fields.every(y=>y<height-64));assert(info.next.length>0&&info.next.every(y=>y<=height))}
  await p.screenshot({path:path.join(out,(route==='/'?'home':route.slice(1))+'-'+width+(scale===1.5?'-large':'')+'.png')});rows.push({route,width,height,scale,status:r.status(),errors,...info,ok:true});p.off('pageerror',onError);
 }
 const result={base,commit:process.env.DESIGN_PREVIEW_COMMIT,checkedAt:new Date().toISOString(),rows};fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(rows.map(x=>({route:x.route,width:x.width,status:x.status,ok:x.ok}))));
}finally{await browser.close()}
