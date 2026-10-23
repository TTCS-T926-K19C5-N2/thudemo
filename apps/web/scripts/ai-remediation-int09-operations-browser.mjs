import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url); const {chromium}=require('playwright');
const root=resolve(import.meta.dirname,'../../..'); const runId=process.env.AI_REMEDIATION_RUN_ID;
assert.match(runId??'',/^\d{8}T\d{6}-remediation$/);
const cache=resolve(root,'.cache/ai-remediation',runId), evidence=resolve(root,'evidence/ai-remediation',runId);
const fixture=JSON.parse(readFileSync(resolve(cache,'int09-batch-fixture.json'),'utf8')); assert.equal(fixture.runId,runId);
mkdirSync(evidence,{recursive:true}); const browser=await chromium.launch({headless:true});
const report={runId,environment:'Run-bound dual-role synthetic organizer/accountant; isolated API/PostgreSQL/Mailpit; lifecycle worker off during UI review.',viewports:['1440x1000','390x844'],http:[],screenshots:[],errors:[],assertions:[]};
async function review(viewport,name){
 const context=await browser.newContext({viewport}); const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{const p=new URL(r.url()).pathname;if(['/api/auth/me','/api/showtimes','/api/operations/refunds',`/api/showtimes/${fixture.showtimeId}/cancellation`].some(x=>p===x||p.startsWith(x+'/')))report.http.push({method:r.request().method(),path:p.includes('/showtimes/')?'/api/showtimes/{fixture}/cancellation':p.replace(/\?.*$/,''),status:r.status()})});
 await page.goto('http://127.0.0.1:3410/login?returnTo=%2Foperations',{waitUntil:'domcontentloaded'});
 await page.locator('#login-email').fill(fixture.organizerEmail); await page.locator('#login-password').fill(fixture.organizerPassword); await page.getByRole('button',{name:'Đăng nhập'}).click();
 await page.waitForURL(url=>['/events','/account','/operations'].includes(url.pathname),{timeout:15000}); if(new URL(page.url()).pathname!=='/operations') await page.goto('http://127.0.0.1:3410/operations',{waitUntil:'domcontentloaded'}); await page.getByRole('heading',{name:'Huỷ suất diễn'}).waitFor({timeout:15000});
 const select=page.getByLabel('Suất diễn'); await select.selectOption(fixture.showtimeId);
 await page.getByText('Trạng thái: COMPLETED',{exact:true}).waitFor({timeout:20000});
 const panel=page.locator('section.operations-panel').filter({has:page.getByRole('heading',{name:'Huỷ suất diễn'})});
 const row=panel.locator('tbody tr').filter({hasText:'SUCCEEDED'}); await row.waitFor({timeout:5000});
 const rowText=(await row.first().innerText()).replace(/\s+/g,' ').trim(); assert.match(rowText,/SUCCEEDED/); assert.match(rowText,/22/);
 await page.getByRole('heading',{name:'Lệnh hoàn tiền cần xử lý'}).waitFor({timeout:5000});
 const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth})); if(viewport.width<500)assert(layout.document<=layout.viewport+2,`mobile overflow ${JSON.stringify(layout)}`);
 const screenshot=`int09-operations-accounting-${name}.png`; await page.screenshot({path:resolve(evidence,screenshot),fullPage:true,animations:'disabled'}); report.screenshots.push(screenshot); report.assertions.push({viewport:`${viewport.width}x${viewport.height}`,jobStatus:'COMPLETED',refundSummary:rowText,accountantPanel:true,mobileOverflow:layout.document<=layout.viewport+2}); await context.close();
}
try { await review({width:1440,height:1000},'desktop'); await review({width:390,height:844},'mobile'); assert.equal(report.errors.length,0); writeFileSync(resolve(evidence,'int09-operations-accounting-browser.json'),JSON.stringify(report,null,2)+'\n'); console.log('INT-09 accounting operations UI showed COMPLETED and 22 succeeded refunds on desktop/mobile.'); }
catch(e){report.failure=e instanceof Error?e.message:String(e);writeFileSync(resolve(evidence,'int09-operations-accounting-browser.json'),JSON.stringify(report,null,2)+'\n');throw e;}
finally{await browser.close();}
