import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {connect} from './android-cdp.mjs';
const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const adb='/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb';
const shell=(...args)=>execFileSync(adb,['-s','emulator-5570','shell',...args],{encoding:'utf8'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const c=await connect(),checks=[];
const title='Repository review fixture';
try{
 await c.poll(()=>!!document.querySelector('[data-action=mobile-menu]'));
 await c.evaluate(()=>document.querySelector('.close-modal')?.click());
 if(await c.evaluate(()=>document.body.classList.contains('reading'))){await c.click('[data-action=exit]');await c.poll(()=>!document.body.classList.contains('reading'));}
 await c.click('[data-action=mobile-menu]');await c.click('[data-nav=library]');
 await c.evaluate(title=>{
  const html='<html><body><div id="nested" style="width:180px;height:70px;overflow-x:auto;white-space:nowrap"><span style="display:inline-block;width:900px">A wide table or code sample owns its horizontal scroll gesture.</span></div>'+Array.from({length:240},(_,i)=>'<p>Paragraph '+i+'. Mira read by the window, finding a new thought in each passage before continuing through the story.</p>').join('')+'</body></html>';
  const dt=new DataTransfer();dt.items.add(new File([html],title+'.html',{type:'text/html'}));const input=document.querySelector('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 },title);
 await c.poll(title=>[...document.querySelectorAll('.book-title')].some(x=>x.textContent===title),title);
 await c.evaluate(title=>[...document.querySelectorAll('.book-title')].find(x=>x.textContent===title).click(),title);
 await c.poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents()?.length);
 await c.native('immersive',{value:false});
 await c.evaluate(()=>{window.__lifecycleErrors=[];window.__lifecycleErrorListener=e=>window.__lifecycleErrors.push(e.message);window.addEventListener('error',window.__lifecycleErrorListener)});
 for(const animation of ['slide','fade']){
  await c.click('[data-action=appearance]');
  await c.evaluate(animation=>{for(const[key,value]of[['flow','paginated'],['animation',animation]]){const el=document.querySelector(`[data-setting=${key}]`);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}},animation);
  await c.click('.close-modal');await c.evaluate(()=>document.querySelector('foliate-view').goToFraction(0));await sleep(500);
  shell('uiautomator','dump','/sdcard/books-lifecycle-ui.xml');
  const match=shell('cat','/sdcard/books-lifecycle-ui.xml').match(/class="android.webkit.WebView"[^>]*bounds="\[\d+,(\d+)\]/);assert.ok(match);
  const point=await c.evaluate(()=>{const r=document.querySelector('foliate-view').renderer,doc=r.getContents()[0].doc,el=doc.querySelector('#nested');el.scrollLeft=0;const box=el.getBoundingClientRect(),frame=doc.defaultView.frameElement.getBoundingClientRect();return{x1:box.right-20+frame.x,x2:box.left+20+frame.x,y:box.top+box.height/2+frame.y,scale:1080/innerWidth,start:r.start}});
  shell('input','swipe',String(Math.round(point.x1*point.scale)),String(Number(match[1])+Math.round(point.y*point.scale)),String(Math.round(point.x2*point.scale)),String(Number(match[1])+Math.round(point.y*point.scale)),'450');
  await sleep(400);
  const state=await c.evaluate(()=>{const r=document.querySelector('foliate-view').renderer;return{start:r.start,nested:r.getContents()[0].doc.querySelector('#nested').scrollLeft}});
  assert.ok(state.nested>40,JSON.stringify({animation,point,state}));assert.ok(Math.abs(state.start-point.start)<2,JSON.stringify({animation,point,state}));
  checks.push({name:'real nested-content swipe with '+animation,status:'passed',...state});
 }
 await c.click('.reader-top-actions [data-action=more]');await c.click('[data-reader-option=autoscroll]');
 await c.evaluate(()=>{for(const[key,value]of[['autoMode','pixel'],['autoSpeed','150']]){const el=document.querySelector(`[data-setting=${key}]`);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}const v=document.querySelector('foliate-view');window.__lifecycleProgress=[];v.renderer.addEventListener('relocate',event=>{if(event.detail.reason==='scroll')window.__lifecycleProgress.push(v.lastLocation.cfi)})});
 await c.click('#start-auto');await sleep(3300);
 const progress=await c.evaluate(()=>({updates:window.__lifecycleProgress,position:document.querySelector('foliate-view').renderer.start,percent:document.querySelector('#reader-percent').textContent}));
 assert.ok(new Set(progress.updates).size>=2,JSON.stringify(progress));assert.ok(Number.parseFloat(progress.percent)>0,JSON.stringify(progress));
 checks.push({name:'live auto-scroll progress',status:'passed',...progress});await c.click('[data-auto-stop]');
 const expected=await c.evaluate(async()=>{const{getVisibleRange}=await import('/foliate/paginator.js');const v=document.querySelector('foliate-view'),r=v.renderer;r.scrollBy(0,1400);await new Promise(resolve=>requestAnimationFrame(resolve));const item=r.getContents()[0],margin=Number.parseFloat(r.getAttribute('margin'));const cfi=v.getCFI(item.index,getVisibleRange(item.doc,r.start+margin,r.end-margin,rect=>({left:rect.top+margin,right:rect.bottom+margin})));const position=r.start;document.querySelector('[data-action=exit]').click();return{cfi,position}});
 await c.poll(()=>!document.body.classList.contains('reading'));await sleep(600);
 const saved=await c.evaluate(title=>new Promise((resolve,reject)=>{const req=indexedDB.open('books-reader');req.onsuccess=()=>{const d=req.result,q=d.transaction('books').objectStore('books').getAll();q.onsuccess=()=>{resolve(q.result.find(x=>x.title===title)?.location);d.close()};q.onerror=()=>reject(q.error)};req.onerror=()=>reject(req.error)}),title);
 assert.equal(saved,expected.cfi);assert.deepEqual(await c.evaluate(()=>window.__lifecycleErrors),[]);
 await c.evaluate(title=>[...document.querySelectorAll('.book-title')].find(x=>x.textContent===title).click(),title);await c.poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents()?.length);
 const reopenedState=await c.evaluate(()=>{const r=document.querySelector('foliate-view').renderer;return{start:r.start,scrolled:r.scrolled}});assert.equal(reopenedState.scrolled,true,'Auto-scroll must retain its saved scroll mode');const reopened=reopenedState.start;assert.ok(Math.abs(reopened-expected.position)<40,JSON.stringify({expected,reopened}));
 checks.push({name:'immediate close saves current CFI, reopens on its line, and has no delayed errors',status:'passed',saved,expectedPosition:expected.position,reopened});
 const report={version,at:new Date().toISOString(),device:'Isolated Android 15 API 35 emulator',checks};await writeFile(`docs/android-repository-review-${version}-results.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await c.evaluate(()=>{window.removeEventListener('error',window.__lifecycleErrorListener);delete window.__lifecycleErrorListener}).catch(()=>{});c.close()}
