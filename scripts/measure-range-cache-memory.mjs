import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const variants=[{label:'previous-object-cache',url:process.env.BOOKS_BASELINE_URL||'http://127.0.0.1:5174'},{label:'numeric-cache-1.1.2',url:process.env.BOOKS_CURRENT_URL||'http://127.0.0.1:5173'}],results=[];
for(const variant of variants){
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/home/divyansh/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
 try{
  const page=await browser.newPage();
  await page.route(variant.url+'/cache-benchmark.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto(variant.url+'/cache-benchmark.html');
  await page.evaluate(async()=>{window.__rangeModule=await import('/foliate/paginator.js');window.__indexModule=await import('/foliate/visible-range.js')});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await cdp.send('HeapProfiler.collectGarbage');const baseline=await cdp.send('Runtime.getHeapUsage');
  await page.evaluate(()=>{const frame=document.createElement('iframe');frame.style.cssText='width:400px;height:600px';document.body.append(frame);const doc=frame.contentDocument;doc.body.style.cssText='margin:0;font:16px/24px serif';doc.body.innerHTML=Array.from({length:16000},(_,i)=>`<p>Paragraph ${i}. Mira read by the window, discovering another thought before continuing with the story.</p>`).join('');window.__cacheDoc=doc;window.__cacheIndex=new window.__indexModule.VisibleRangeIndex(doc);window.__rangeModule.getVisibleRange(doc,1000000,1000600,rect=>({left:rect.top,right:rect.bottom}),window.__cacheIndex)});
  await page.waitForTimeout(300);
  const gc=[];for(let i=0;i<2;i++){const start=performance.now();await cdp.send('HeapProfiler.collectGarbage');gc.push(performance.now()-start)}
  const heap=await cdp.send('Runtime.getHeapUsage');
  const afterGC=await page.evaluate(()=>{const doc=window.__cacheDoc,proto=doc.defaultView.Element.prototype,rect=proto.getBoundingClientRect;let reads=0;proto.getBoundingClientRect=function(...args){reads++;return rect.apply(this,args)};try{for(const at of [500000,1500000])window.__rangeModule.getVisibleRange(doc,at,at+600,rect=>({left:rect.top,right:rect.bottom}),window.__cacheIndex);return{geometryReads:reads,paragraphs:doc.querySelectorAll('p').length}}finally{proto.getBoundingClientRect=rect}});
  results.push({...variant,baseline,heap,retainedJSBytes:heap.usedSize-baseline.usedSize,gcCommandWallMs:gc,afterGC});
 }finally{await browser.close()}
}
const report={at:new Date().toISOString(),environment:'Fresh desktop Chromium renderer per variant, 4x CPU throttling, same 16000-paragraph document; explicit GC is diagnostic only',results};
await writeFile('docs/range-cache-memory-1.1.2.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
