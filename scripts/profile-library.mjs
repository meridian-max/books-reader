// Isolated synthetic library; never writes to the Android installation.
import { chromium } from '@playwright/test';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
const version=JSON.parse(await readFile('package.json','utf8')).version;
await mkdir(`docs/verification-${version}`,{recursive:true});
const label = process.argv[2] || 'current';
const browser = await chromium.launch({executablePath: '/home/divyansh/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const page = await browser.newPage({viewport:{width:412,height:850}, reducedMotion:'reduce'});
await page.goto('http://127.0.0.1:5173');
await page.locator('.welcome-card').waitFor();
await page.evaluate(async () => {
  const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('books-reader');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const tx=db.transaction('books','readwrite');
  for(let i=0;i<500;i++) tx.objectStore('books').put({id:`perf-${i}`,title:`${i%2?'Evening stories':'Quiet mornings'} ${String(i).padStart(3,'0')}`,author:`Author ${i%30}`,filename:`book-${i}.txt`,format:'txt',added:500-i,lastRead:i%3?0:1000-i,progress:i%3?0:.3,location:'',cover:'',tags:[],favorite:i%10===0,rating:i%5,finished:false,seconds:0,words:30,size:120,blob:new Blob(['A quiet morning. '.repeat(30)],{type:'text/plain'})});
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
});
await page.reload();await page.locator('.continue-card').waitFor();
const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
await page.evaluate(()=>{window.perfTasks=[];new PerformanceObserver(list=>window.perfTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:false})});
const runs=[];
for(let i=0;i<5;i++){
  const navigation=await page.evaluate(async()=>{const t=performance.now();document.querySelector('[data-tab=library]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-t});
  const search=await page.evaluate(async()=>{const t=performance.now(),el=document.querySelector('#library-search');el.value='Evening stories';el.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-t});
  await page.waitForFunction(()=>document.querySelector('.library-result-count')?.textContent.includes('250'));
  const nodes=await page.locator('#books-grid *').count();
  runs.push({navigationMs:navigation,searchMs:search,filteredDomNodes:nodes});
  await page.locator('[data-action=close-search]').click();
  await page.locator('[data-tab=home]').click();await page.locator('.continue-card').waitFor();
}
const longTasks=await page.evaluate(()=>window.perfTasks);
const median=key=>runs.map(r=>r[key]).sort((a,b)=>a-b)[2];
const report={label,fixture:'500 synthetic TXT books, 412×850 Chromium, 4× CPU slowdown, reduced motion, five runs',runs,medianNavigationMs:median('navigationMs'),medianSearchMs:median('searchMs'),longTaskCount:longTasks.length,longestTaskMs:Math.max(0,...longTasks.map(t=>t.duration))};
await writeFile(`docs/verification-${version}/library-${label}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await browser.close();
