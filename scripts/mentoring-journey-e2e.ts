import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer, { type Page } from "puppeteer-core";
import { readSeedZones } from "../src/lib/zones";
const base=process.env.E2E_BASE || "http://127.0.0.1:3105";
assert.ok(["127.0.0.1","localhost"].includes(new URL(base).hostname));
const out=path.resolve(process.env.TASK_OUTPUT || ".e2e-shots/mentoring");
fs.mkdirSync(out,{recursive:true});
const checks:string[]=[], errors:string[]=[];
const pass=(name:string)=>{checks.push(name);console.log("PASS",name);};
async function main() {
const browser=await puppeteer.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
async function api(page:Page,url:string,body:unknown){return page.evaluate(async(url,body)=>{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};},url,body);}
async function button(page:Page,text:string){await page.waitForFunction(text=>Array.from(document.querySelectorAll("button")).some(b=>b.textContent?.includes(text)),{},text);await page.evaluate(text=>{const b=Array.from(document.querySelectorAll("button")).find(b=>b.textContent?.includes(text));b?.click();},text);}
async function axe(page:Page,label:string){await page.addScriptTag({path:createRequire(import.meta.url).resolve("axe-core/axe.min.js")});const bad=await page.evaluate(async()=>{const w=window as unknown as {axe:{run:(o:unknown)=>Promise<{violations:{id:string;impact:string;nodes:unknown[]}[]}>}};return(await w.axe.run({runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}})).violations.filter(v=>["serious","critical"].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes}));});assert.deepEqual(bad,[],label);pass(label);}
try {
 const page=await browser.newPage();page.on("pageerror",e=>errors.push(String(e)));await page.setViewport({width:1440,height:1000});await page.goto(base+"/visits");
 const staffContext=await browser.createBrowserContext(), staff=await staffContext.newPage();staff.on("pageerror",e=>errors.push(String(e)));await staff.goto(base+"/staff/login");
 const zones=readSeedZones();const seeded=await staff.evaluate(async codes=>(await fetch("/api/admin/setup",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer dx-local-check-only"},body:JSON.stringify({codes})})).status,Object.fromEntries(zones.map(z=>[z.id,z.code])));assert.equal(seeded,200);
 assert.equal((await api(staff,"/api/staff/login",{code:zones.find(z=>z.isDesk)!.code})).status,200);
 await page.reload();await page.waitForSelector('input[name="visit-time"]:not([disabled])');
 await axe(page,"desktop appointment accessibility");await page.screenshot({path:path.join(out,"appointments-desktop.png"),fullPage:true});
 await page.$eval('input[name="visit-time"]:not([disabled])',el=>(el as HTMLInputElement).click());await page.$eval('input[type="checkbox"]',el=>(el as HTMLInputElement).click());await button(page,"이 시간으로 예약");await page.waitForFunction(()=>/\/visits\/[a-f0-9]{64}/.test(location.pathname));const formReceipt=new URL(page.url()).pathname.split("/").pop()!;const formStatus=await api(page,"/api/visits",{action:"status",receipt:formReceipt});assert.equal(formStatus.status,200);await api(page,"/api/visits",{action:"cancel",receipt:formReceipt,version:formStatus.body.visit.version});pass("booking form submits through API and opens its saved confirmation");
 const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 const slots=await page.evaluate(async day=>(await(await fetch("/api/visits?hub=t1-airside&service=robot&day="+day)).json()).slots,day);
 const slot=slots.find((s:{remaining:number;startAt:string})=>s.remaining&&Date.parse(s.startAt)-Date.now()<=15*60000) || slots.find((s:{remaining:number})=>s.remaining);
 assert.ok(slot,"an available slot exists");
 const receipt="a"+Date.now().toString(16).padStart(63,"0");
 const booked=await api(page,"/api/visits",{action:"book",receipt,consent:true,hubId:"t1-airside",service:"robot",task:"directions",party:2,startAt:slot.startAt,recognition:"초록 가방"});
 assert.equal(booked.status,200);pass("real API booking persists and returns confirmation");
 await page.goto(base+"/visits/"+receipt);await page.waitForFunction(()=>document.body.innerText.includes("초록 가방"));pass("confirmation renders stored booking");
 await page.setViewport({width:390,height:844});await axe(page,"mobile confirmation accessibility");assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));pass("mobile confirmation has no horizontal overflow");await page.screenshot({path:path.join(out,"appointment-mobile.png"),fullPage:true});
 await page.goto(base+"/visits");await page.waitForFunction(()=>document.body.innerText.includes("이 기기의 예약"));pass("saved appointment survives navigation");
 if(Date.parse(slot.startAt)-Date.now()<=15*60000) {
   await page.goto(base+"/visits/"+receipt);await button(page,"이곳에 도착했어요");await page.waitForFunction(()=>!!Array.from(document.querySelectorAll("button")).find(b=>b.textContent?.includes("로봇 화면 안내 시작")));
   await button(page,"로봇 화면 안내 시작");await page.waitForSelector("#robot-topic");await axe(page,"robot on-screen response accessibility");
   await button(page,"안내를 받았어요");await page.waitForFunction(()=>document.querySelector("h1")?.textContent==="완료");
   const done=await api(page,"/api/visits",{action:"status",receipt});assert.equal(done.body.visit.state,"done");assert.equal(done.body.visit.requestId,null);pass("robot resolves simple guidance without a staff request");
   const handReceipt="b"+Date.now().toString(16).padStart(63,"0");
   const hand=await api(page,"/api/visits",{action:"book",receipt:handReceipt,consent:true,hubId:"t1-airside",service:"robot",task:"directions",party:2,startAt:slot.startAt,recognition:"노란 가방"});
   assert.equal(hand.status,200);
   let v=hand.body.visit;
   for(const action of ["checkin","respond","handover"]){const result=await api(page,"/api/visits",{action,receipt:handReceipt,version:v.version});assert.equal(result.status,200,JSON.stringify(result.body));v=result.body.visit;}
   assert.ok(v.requestId);pass("same capability links robot handover to unified staff request");
   assert.equal((await api(staff,"/api/staff/visits",{action:"shift",label:"시험 담당자",state:"available"})).status,200);
   assert.equal((await api(staff,"/api/staff/visits",{action:"claim",id:v.id,version:v.version})).status,200);
   const delayed=await api(staff,"/api/staff/visits",{action:"delay",id:v.id,version:v.version+1,reason:"현장 직원이 먼저 안내합니다."});assert.equal(delayed.status,200);
   await page.goto(base+"/visits/"+handReceipt);await page.waitForFunction(()=>document.body.innerText.includes("현장 직원이 먼저"));pass("staff claims ownership and delay notice reaches traveller");
   const latest=await api(page,"/api/visits",{action:"status",receipt:handReceipt});await api(page,"/api/visits",{action:"cancel",receipt:handReceipt,version:latest.body.visit.version});
 }
 await staff.goto(base+"/staff/visits");await staff.waitForFunction(()=>document.body.innerText.includes("시험 담당자")||document.body.innerText.includes("근무"));await staff.setViewport({width:1440,height:1000});await axe(staff,"staff appointment workspace accessibility");await staff.screenshot({path:path.join(out,"staff-visits.png"),fullPage:true});
 await staff.goto(base+"/staff/experience");await staff.waitForFunction(()=>document.body.innerText.includes("같은 과제의 전후 비교"));await axe(staff,"measured-effect dashboard accessibility");
 assert.equal((await api(staff,"/api/staff/visits",{action:"study",channel:"phone",task:"guidance",seconds:180,relays:2,repeated:1,completed:true})).status,200);await staff.reload();await staff.waitForFunction(()=>document.body.innerText.includes("180"));pass("measured comparison is stored and displayed");
 for(const url of ["/points/concourse","/points/print"]){await page.goto(base+url);await axe(page,url+" accessibility");assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}pass("meeting-point map and QR print pages work on mobile");
 await page.goto(base+"/stamp");await page.waitForSelector("h1");await page.evaluate(()=>localStorage.setItem("jsp:stamp-book",JSON.stringify({theme:"flight",name:"시연",gate:"250",mode:"route",startHub:"t2-departure",stamps:{},role:"captain",photo:"",certId:"",certAt:0})));await page.reload();await page.waitForSelector('section[aria-label="탑승구 방향 거점"]');const text=await page.evaluate(()=>document.querySelector('section[aria-label="탑승구 방향 거점"]')?.textContent || "");assert.ok(!text.includes("탑승동 중앙"));pass("stamp route follows the selected terminal");
 await axe(page,"stamp route accessibility");await page.screenshot({path:path.join(out,"stamp-route-mobile.png"),fullPage:true});
 assert.deepEqual(errors,[]);pass("no browser runtime errors");fs.writeFileSync(path.join(out,"results.json"),JSON.stringify({checks,errors},null,2));
} finally {await browser.close();}

}
void main().catch(e=>{console.error(e);process.exitCode=1;});
