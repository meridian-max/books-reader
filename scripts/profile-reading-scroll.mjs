import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {connect} from './android-cdp.mjs';
const nativeMode=process.argv.includes('--android');
const continuous=process.argv.includes('--continuous');
const trace=process.argv.includes('--trace');
const label=process.argv.find(x=>x.startsWith('--label='))?.slice(8)||'current';
const steps=Number(process.argv.find(x=>x.startsWith('--steps='))?.slice(8)||4);
const count=Number(process.argv.find(x=>x.startsWith('--paragraphs='))?.slice(13))||16000;
const cpuRate=Number(process.argv.find(x=>x.startsWith('--cpu-rate='))?.slice(11))||4;
const text=Array.from({length:count},(_,i)=>`Paragraph ${i}. Mira opened her book and read by the window. Each page offered another story and a new thought. She paused to consider the words before continuing with the next paragraph.`).join('\n\n');
const name='Large scroll performance fixture.txt';
let browser,c,page,send,evaluate,click,poll,on;
try {
 if(nativeMode){
  c=await connect();({send,evaluate,click,poll,on}=c);
  await send('Page.reload');await poll(()=>!!document.querySelector('[data-action=mobile-menu]'));
  await click('[data-nav=library]');
  await evaluate(({name,text})=>{const input=document.querySelector('#file-input'),dt=new DataTransfer();dt.items.add(new File([text],name,{type:'text/plain'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));},{name,text});
  await poll(name=>[...document.querySelectorAll('.book-title')].some(x=>x.textContent===name.replace(/\.txt$/,'')),name,60000);
  await evaluate(name=>[...document.querySelectorAll('.book-title')].find(x=>x.textContent===name.replace(/\.txt$/,'')).click(),name);
  await poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents()?.length,undefined,60000);
  await click('[data-action=appearance]');
  await evaluate(()=>{for(const[key,value]of[['flow','scrolled'],['fontSize','20'],['margin','28']]){const el=document.querySelector(`[data-setting=${key}]`);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}});
  await click('.close-modal');
 }else{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/home/divyansh/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
  page=await browser.newPage({viewport:{width:412,height:850}});
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#file-input').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(text)});
  await page.locator('.book-cover-button').click();
  await page.waitForFunction(()=>!!document.querySelector('foliate-view')?.renderer?.getContents()?.length,{timeout:60000});
  await page.locator('[data-action=appearance]').click();await page.locator('[data-setting=flow]').selectOption('scrolled');await page.locator('.close-modal').click();
  const session=await page.context().newCDPSession(page);send=(...args)=>session.send(...args);evaluate=(...args)=>page.evaluate(...args);on=(event,fn)=>session.on(event,fn);
 }
 await new Promise(resolve=>setTimeout(resolve,1200));
 if(continuous){
  if(nativeMode){
   await click('.reader-top-actions [data-action=more]');await click('[data-reader-option=autoscroll]');
   await evaluate(()=>{for(const[key,value]of[['autoMode','pixel'],['autoSpeed','150']]){const el=document.querySelector(`[data-setting=${key}]`);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}});
  }else{
   await page.locator('.reader-top-actions [data-action=more]').click();await page.locator('[data-reader-option=autoscroll]').click();
   await page.locator('[data-setting=autoMode]').selectOption('pixel');await page.locator('[data-setting=autoSpeed]').fill('150');
  }
 }
 let throttled=false;
 if(trace) await send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline,renderer.scheduler',transferMode:'ReturnAsStream'});
 try{await send('Emulation.setCPUThrottlingRate',{rate:cpuRate});throttled=true}catch{}
 const report=await evaluate(async({steps,continuous})=>{
  const v=document.querySelector('foliate-view'),r=v.renderer,doc=r.getContents()[0].doc;
  const probe={rectReads:0,walks:0,longTasks:[],relocations:[],slowFrames:[],activity:[],gaps:[]};
  const proto=doc.defaultView.Element.prototype,rect=proto.getBoundingClientRect,walker=doc.createTreeWalker;
  proto.getBoundingClientRect=function(...args){probe.rectReads++;return rect.apply(this,args)};
  doc.createTreeWalker=function(...args){probe.walks++;return walker.apply(this,args)};
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){const at=performance.now(),name=this.name;performance.mark('books-put-'+name);const request=put.apply(this,args);probe.activity.push({type:'put',store:name,at,duration:performance.now()-at,blobBytes:args[0]?.blob?.size??0});this.transaction.addEventListener('complete',()=>probe.activity.push({type:'complete',store:name,at:performance.now()}),{once:true});return request};
  const observer=new PerformanceObserver(list=>probe.longTasks.push(...list.getEntries().map(x=>({at:x.startTime,duration:x.duration}))));observer.observe({type:'longtask'});
  const relocate=()=>probe.relocations.push({at:performance.now(),rectReads:probe.rectReads,cfi:v.lastLocation.cfi});v.addEventListener('relocate',relocate);
  let previous=performance.now(),done=false;const frame=now=>{const gap=now-previous;probe.gaps.push(gap);if(gap>34)probe.slowFrames.push({at:now,duration:gap});previous=now;if(!done)requestAnimationFrame(frame)};requestAnimationFrame(frame);
  const started=performance.now(),initialPosition=r.start;performance.mark('books-scroll-profile-start');
  try{
   if(continuous){document.querySelector('#start-auto').click();await new Promise(resolve=>setTimeout(resolve,steps*650));document.querySelector('[data-auto-stop]')?.click();}
   else for(let i=0;i<steps;i++){const fraction=[.1,.4,.7,.95][i%4];r.scrollBy(0,r.viewSize*fraction-r.start);await new Promise(resolve=>setTimeout(resolve,650));}
   return{...probe,startedAt:started,count:doc.querySelectorAll('p').length,elapsed:performance.now()-started,height:r.viewSize,scrolledPixels:r.start-initialPosition,preview:v.lastLocation.range.toString().slice(0,150)};
  }finally{done=true;observer.disconnect();proto.getBoundingClientRect=rect;doc.createTreeWalker=walker;IDBObjectStore.prototype.put=put;v.removeEventListener('relocate',relocate)}
 },{steps,continuous});
 const gaps=report.gaps.slice(1).sort((a,b)=>a-b);
 const output={label,at:new Date().toISOString(),platform:nativeMode?'Android 15 WebView emulator':'Desktop Chromium, mobile viewport',mode:continuous?'continuous-auto-scroll':'repeated-stops',cpuThrottleRate:throttled?cpuRate:1,steps,...report,gaps:undefined,frames:gaps.length,p95FrameMs:gaps[Math.floor(gaps.length*.95)],maxFrameMs:Math.max(...gaps),framesOver34ms:gaps.filter(x=>x>34).length};
 if(trace){const complete=new Promise(resolve=>on('Tracing.tracingComplete',resolve));await send('Tracing.end');const{stream}=await complete;let data='';for(;;){const chunk=await send('IO.read',{handle:stream});data+=chunk.data;if(chunk.eof)break}await send('IO.close',{handle:stream});output.tracePath=`/tmp/books-${label}-trace.json`;await writeFile(output.tracePath,data);}
 await writeFile(`docs/large-scroll-${label}.json`,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
}finally{try{await send?.('Emulation.setCPUThrottlingRate',{rate:1})}catch{}c?.close();await browser?.close()}
