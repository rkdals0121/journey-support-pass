import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
// Run against a locally seeded development server; never a production deployment.
const base = process.env.HANEULI_CHECK_URL || 'http://127.0.0.1:3217';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local server required');
const output = path.resolve(process.env.HANEULI_CAPTURE_DIR || 'work/haneuli-viewport');
fs.mkdirSync(output, { recursive: true });
const chrome = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!chrome) throw Error('Set CHROME_PATH to a Chrome/Chromium executable');
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
try {
 const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1366,height:768});
 await page.goto(base+'/kiosk');
 const login=await page.evaluate(async()=>{const r=await fetch('/api/kiosk/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'300300',placeId:'cc-train'})}); return r.status;});
 if(login!==200) throw Error('login '+login);
 const results=[];
 for(const [width,height] of [[1366,768],[1280,720],[1280,600],[1440,900],[1920,1080],[1024,600],[1440,650]]) {
  await page.setViewport({width,height});
  for (const lang of ['ko','en']) {
   await page.goto(base+'/kiosk/guide?lang='+lang,{waitUntil:'networkidle0'});
   await page.waitForSelector('.haneuli-welcome');
   for(const state of ['idle','awake']) {
    if(state==='awake') { await page.click('.haneuli-start'); await page.waitForSelector('.is-awake'); }
    await new Promise(r=>setTimeout(r,850));
    const metrics=await page.evaluate(()=>{
     const root=document.documentElement;
     const selectors=['.haneuli-intro','.haneuli-menu','.haneuli-scan','.haneuli-number','.haneuli-camera .btn',...(document.querySelector('.is-awake') ? ['.haneuli-rest'] : ['.haneuli-start'])];
     const boxes=selectors.map(s=>{const el=document.querySelector(s),r=el.getBoundingClientRect(); return {s,bottom:Math.round(r.bottom),top:Math.round(r.top),overflow:el.scrollHeight-el.clientHeight};});
     return {height:innerHeight,scrollHeight:root.scrollHeight,width:innerWidth,scrollWidth:root.scrollWidth,boxes,duplicate:document.body.textContent.includes('화면을 누르면 안내가 시작돼요')};
    });
    results.push({width,height,lang,state,...metrics});
    if(metrics.scrollHeight>height+1||metrics.scrollWidth>width+1||metrics.boxes.some(b=>b.bottom>height+1||b.top<0||b.overflow>2)||metrics.duplicate) throw Error(JSON.stringify(results.at(-1)));
    if(lang==='ko'&&[1366,1280].includes(width)&&height>=720) await page.screenshot({path:path.join(output, `kiosk-${width}x${height}-${state}.png`),fullPage:false});
   }
  }
 }
 fs.writeFileSync(path.join(output, 'verification.json'),JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({checked:results.length,errors}));
} finally { await browser.close(); }
