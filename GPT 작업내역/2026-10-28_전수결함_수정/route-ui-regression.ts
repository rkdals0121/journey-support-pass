import puppeteer, {type Page} from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {readSeedZones} from "../../src/lib/zones";
async function main() {
 const root=process.cwd(),out=path.join(root,"GPT 작업내역/2026-10-28_전수결함_수정"),base="http://127.0.0.1:3133";
 const files=fs.readdirSync(path.join(root,"src/app"),{recursive:true}).filter(f=>String(f).endsWith("page.tsx")).map(String);
 const routes=files.map(f=>"/"+path.dirname(f).replaceAll("\\","/")).map(r=>r==="/."?"/":r).filter(r=>!r.includes("["));
 const b=await puppeteer.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
 const rows:Record<string,unknown>[]=[],errors:Record<string,unknown>[]=[];
 try {
  const context=await b.createBrowserContext(), staff=await context.newPage(),kctx=await b.createBrowserContext(),kiosk=await kctx.newPage(),p=await b.newPage();
  for(const page of [staff,kiosk,p]){page.on("pageerror",e=>errors.push({url:page.url(),error:String(e)}));page.setDefaultTimeout(12000);}
  async function login(page:Page,route:string,body:unknown){await page.goto(base+"/");const status=await page.evaluate(async(route,body)=>(await fetch(route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).status,route,body);if(status!==200)throw Error("fixture login "+status);}
  await login(staff,"/api/staff/login",{code:readSeedZones().find(z=>z.isDesk)!.code});await login(kiosk,"/api/kiosk/login",{code:readSeedZones().find(z=>z.isKiosk)!.code,placeId:"cc-center"});
  async function inspect(page:Page,route:string,width:number,height:number){
   await page.setViewport({width,height});const response=await page.goto(base+route);
   await page.waitForSelector("h1,main").catch(()=>{});await new Promise(r=>setTimeout(r,350));
   await page.addScriptTag({path:createRequire(import.meta.url).resolve("axe-core/axe.min.js")});
   const result=await page.evaluate(async()=>{
    const win=window as unknown as {axe:{run:(o:unknown)=>Promise<{violations:{id:string;impact:string;nodes:{target:string[];failureSummary:string}[]}[]}>}};
    const violations=(await win.axe.run({runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}})).violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target),summary:v.nodes[0]?.failureSummary}));
    return {title:document.querySelector("h1")?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,violations};
   });rows.push({route,viewport:width+"x"+height,status:response?.status(),actualUrl:page.url(),...result});
   if(result.overflow||result.violations.length)await page.screenshot({path:path.join(out,"route-"+route.replaceAll("/","-").replaceAll("?","-")+width+".png"),fullPage:true});
  }
  for(const route of routes){const page=route.startsWith("/staff")?staff:route.startsWith("/kiosk")?kiosk:p;await inspect(page,route,1440,1000);console.log("CHECK",route);}
  for(const route of ["/","/prepare","/register","/services","/help","/requests","/visits","/points","/navigate","/staff/requests","/staff/visits","/staff/experience","/kiosk/guide"]){const page=route.startsWith("/staff")?staff:route.startsWith("/kiosk")?kiosk:p;await inspect(page,route,390,844);}
  for(const theme of ["flight","explorer","friend"]){await p.goto(base+"/stamp");await p.waitForSelector("h1");await p.evaluate(theme=>localStorage.setItem("jsp:stamp-book",JSON.stringify({theme,name:"시연",gate:"250",mode:"route",startHub:"t2-departure",stamps:{},role:theme==="flight"?"captain":theme,photo:"",certId:"",certAt:0})),theme);await inspect(p,"/stamp?themecheck="+theme,390,844);}
  fs.writeFileSync(path.join(out,"route-ui-audit.json"),JSON.stringify({sourcePageFiles:files,rows,errors},null,2));
  console.log(JSON.stringify({routeCount:routes.length,scans:rows.length,problems:rows.filter(r=>r.overflow||(r.violations as unknown[]).length),errors},null,2));
 }finally{await b.close();}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
