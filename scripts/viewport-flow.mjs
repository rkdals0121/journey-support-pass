import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const base='http://127.0.0.1:3170';
const out=path.resolve('GPT 작업내역/2026-10-30_첫화면_배치');
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
async function clickText(page,selector,text){const handles=await page.$$(selector);for(const h of handles){if((await h.evaluate(e=>e.textContent)).includes(text)&&await h.boundingBox()){await h.click();return}}throw Error('Missing '+text)}
try {
 for(const width of [390,1280,1920]){
  const page=await browser.newPage();await page.setViewport({width,height:width===390?844:width===1280?633:937});
  await page.goto(base+'/help?topic=mobility&fresh=1',{waitUntil:'networkidle0'});
  assert.equal(await page.$eval('[data-request-step="1"]',e=>getComputedStyle(e).display),'none');
  await clickText(page,'.request-task-options label','휠체어');
  await page.click('[data-request-next]');await page.waitForSelector('.request-form[data-active-step="1"]');
  await page.$eval('.place-manual',e=>e.open=true);await page.select('#dx-place','cc-center');
  await clickText(page,'.request-mobile-nav button','이전');
  await page.waitForSelector('.request-form[data-active-step="0"]');
  assert.equal(await page.$eval('#dx-place',e=>e.value),'cc-center');
  await page.click('[data-request-next]');await page.waitForSelector('.request-form[data-final-step="true"]');
  await page.click('input[type="checkbox"][required]');await page.click('button[type="submit"]');
  await page.waitForSelector('.request-review-card');assert.match(await page.$eval('.request-review-card',e=>e.textContent),/휠체어/);
  await clickText(page,'.request-review-actions button','내용 수정');
  await page.waitForSelector('.request-form');assert.equal(await page.$eval('#dx-place',e=>e.value),'cc-center');
  await page.screenshot({path:path.join(out,`mobility-final-${width}.png`)});
  results.push({width,flow:'mobility',backRetainsPlace:true,review:true});await page.close();
 }
 const page=await browser.newPage();await page.setViewport({width:1280,height:633});
 await page.goto(base+'/navigate',{waitUntil:'networkidle0'});await page.$eval('.place-manual',e=>e.open=true);await page.select('#nav-place','cc-center');await page.type('#nav-gate','130');await page.click('button[type="submit"]');await page.waitForSelector('.journey-route-steps');results.push({flow:'navigation',route:true});await page.close();
 fs.writeFileSync(path.join(out,'flow-check.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close()}
