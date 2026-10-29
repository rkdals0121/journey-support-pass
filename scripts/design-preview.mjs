import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {fileURLToPath} from 'node:url';
export async function verifyPreview({base,token,shareUrl,commit,outDir}) {
if(!base||new URL(base).protocol!=='https:'||!new URL(base).hostname.endsWith('.vercel.app'))throw Error('Exact Vercel preview URL required');
if(!token&&!shareUrl)throw Error('Authenticated preview access required');
const dir=path.resolve(outDir??'GPT 작업내역/2026-10-28_전면디자인/preview');fs.mkdirSync(dir,{recursive:true});
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const rows=[];
try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:800});await page.setRequestInterception(true);
 page.on('request',request=>{const headers={...request.headers()};if(token&&new URL(request.url()).origin===new URL(base).origin)headers['x-vercel-trusted-oidc-idp-token']=token;void request.continue({headers});});
 if(shareUrl)await page.goto(shareUrl,{waitUntil:'networkidle2',timeout:90000});
 const headings={'/':'공항에서 무엇을 도와드릴까요?','/register':'어떤 점이 불편하세요?','/staff/login':'직원 로그인','/kiosk':'현장 기기 설치'};
 for(const route of Object.keys(headings)){
  const errors=[],serverErrors=[];const error=e=>errors.push(e.message);const serverError=r=>{if(r.status()>=500&&new URL(r.url()).origin===new URL(base).origin)serverErrors.push({path:new URL(r.url()).pathname,status:r.status()})};page.on('pageerror',error);page.on('response',serverError);
  const response=await page.goto(base+route,{waitUntil:'networkidle2',timeout:90000});await page.waitForSelector('h1,main',{timeout:30000});await page.evaluate(()=>document.fonts.ready);
  const info=await page.evaluate(()=>({title:document.title,heading:document.querySelector('h1')?.textContent,main:!!document.querySelector('main,[role="main"]'),theme:document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),text:document.body.innerText.slice(0,160)}));
  const file=(route==='/'?'home':route.slice(1).replaceAll('/','-'))+'.png';await page.screenshot({path:path.join(dir,file),fullPage:true});
  const final=new URL(page.url()),ok=response?.status()===200&&final.origin===new URL(base).origin&&final.pathname===route&&info.main&&info.heading?.replace(/\s/g,'')===headings[route].replace(/\s/g,'')&&info.theme?.toUpperCase()==='#2F5D46'&&!serverErrors.length&&!errors.length&&!/Authentication Required|Login – Vercel/.test(info.title);
  rows.push({route,status:response?.status(),finalPath:final.pathname,...info,expectedHeading:headings[route],errors,serverErrors,screenshot:file,ok});page.off('pageerror',error);page.off('response',serverError);
 }
 const result={checkedAt:new Date().toISOString(),base,commit,rows};fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(result,null,2));if(rows.some(r=>!r.ok))throw Error('Preview render check failed; see sanitized verification.json');return result;
}finally{await browser.close();}

}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await verifyPreview({base:process.env.DESIGN_PREVIEW_BASE,token:process.env.VERCEL_OIDC_TOKEN,shareUrl:process.env.DESIGN_PREVIEW_SHARE_URL,commit:process.env.DESIGN_PREVIEW_COMMIT});console.log(JSON.stringify(result,null,2));
}
