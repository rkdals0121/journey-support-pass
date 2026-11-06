import fs from 'node:fs';import assert from 'node:assert/strict';import puppeteer from 'puppeteer-core';
const out='docs/design-before-after/robot-group';fs.mkdirSync(out,{recursive:true});
const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{for(const [width,height] of [[1366,900],[1080,1920],[390,844]])for(const scale of [1,1.5]){
 const p=await b.newPage();await p.setViewport({width,height});await p.evaluateOnNewDocument(s=>sessionStorage.setItem('jsp:view',JSON.stringify({scale:s,voice:null,picture:null})),scale);
 await p.goto('http://127.0.0.1:3001/help?topic=facility&fresh=1',{waitUntil:'networkidle2'});const baseline=await p.$eval('.ph-hero h1',e=>getComputedStyle(e).fontSize);
 await p.goto('http://127.0.0.1:3001/help?topic=mobility&fresh=1',{waitUntil:'networkidle2'});
 assert.equal(await p.$eval('.ph-hero h1',e=>getComputedStyle(e).fontSize),baseline,'Mobility title must match other service titles');
 const result=await p.evaluate(()=>{const r=document.querySelector('.public-header').getBoundingClientRect(),a=document.querySelector('[data-mobility-home] .public-back').getBoundingClientRect();return {back:a.y,header:r.bottom,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,links:[...document.querySelectorAll('[data-mobility-action]')].map(e=>[e.dataset.mobilityAction,e.getAttribute('href')]),h1:document.querySelectorAll('h1').length}});
 assert.ok(result.back>=result.header);assert.ok(result.overflow<=1);assert.equal(result.h1,1);assert.equal(result.links.length,4);assert.equal(await p.$$eval('section[aria-labelledby=mobility-welcome] h2',es=>es.length),1);assert.equal(await p.$$eval('section[aria-labelledby=mobility-welcome] button,section[aria-labelledby=mobility-welcome] a',es=>es.length),2);const links=Object.fromEntries(result.links);assert.ok(links.directions.includes('entry=mobility'));assert.ok(links.cart.includes('flow=staff')&&links.cart.includes('task=mobility-vehicle'));assert.ok(links.robot.includes('flow=robot'));assert.ok(links.requests.startsWith('/requests'));
 if(width===1366&&scale===1)await p.screenshot({path:out+'/mobility-home-laptop.png',fullPage:true});
 if(width===390&&scale===1)await p.screenshot({path:out+'/mobility-home-phone.png',fullPage:true});
 console.log(JSON.stringify({width,scale,title:baseline,ok:true}));await p.close();
}}finally{await b.close()}
