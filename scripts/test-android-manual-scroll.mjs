import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import {connect} from './android-cdp.mjs';
import {manualScrollBook} from './manual-scroll-fixture.mjs';
import {createHash} from 'node:crypto';

const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const label=process.argv[2]??version;
const adb='/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb';
const shell=(...args)=>execFileSync(adb,['-s','emulator-5570','shell',...args],{encoding:'utf8'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const c=await connect(),checks=[];
const fixture=manualScrollBook(),bookId=createHash('sha256').update(fixture).digest('hex');
const state=()=>c.evaluate(()=>{const v=document.querySelector('foliate-view'),r=v.renderer;return r?{start:r.start,end:r.end,extent:r.viewSize,size:r.size,index:r.getContents()[0].index,cfi:v.lastLocation.cfi}:null});
let inset=0;
async function swipe(dx,dy,point) {
  const box=await c.evaluate(()=>{const b=document.querySelector('foliate-view').getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,scale:1080/innerWidth}});
  const x=point?.x??box.x+box.width/2-dx/2,y=point?.y??box.y+box.height/2-dy/2;
  shell('input','swipe',String(Math.round(x*box.scale)),String(inset+Math.round(y*box.scale)),String(Math.round((x+dx)*box.scale)),String(inset+Math.round((y+dy)*box.scale)),'420');
  await sleep(500);
}
async function settings(flow,animation='slide') {
  await c.click('[data-action=appearance]');
  await c.evaluate(({flow,animation})=>{for(const[key,value]of[['flow',flow],['animation',animation],['animationSpeed','200'],['fontSize','20'],['ruler','none']]){const el=document.querySelector(`[data-setting=${key}]`);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}},{flow,animation});
  await c.click('.close-modal');
  await c.evaluate(()=>document.querySelector('foliate-view').goTo(0));
  await sleep(500);
}
async function check(name,fn) {
  try {const details=await fn();checks.push({name,status:'passed',details});console.log('PASS',name,JSON.stringify(details));}
  catch(error){checks.push({name,status:'failed',error:error.message});console.error('FAIL',name,error.message)}
}
try {
  await c.poll(()=>!!document.querySelector('[data-action=mobile-menu]'));
  await c.evaluate(()=>document.querySelector('.close-modal')?.click());
  if(await c.evaluate(()=>document.body.classList.contains('reading'))) {await c.click('[data-action=exit]');await c.poll(()=>!document.body.classList.contains('reading'))}
  await c.click('[data-action=mobile-menu]');await c.click('[data-nav=library]');
  await c.evaluate(base64=>{const data=Uint8Array.from(atob(base64),x=>x.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([data],'Manual scrolling.epub',{type:'application/epub+zip'}));const input=document.querySelector('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))},Buffer.from(fixture).toString('base64'));
  await c.poll(id=>!!document.querySelector(`[data-open="${id}"]`),bookId);
  await c.click(`[data-open="${bookId}"]`);
  await c.poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents().length);
  await c.native('immersive',{value:false});
  const display=shell('dumpsys','window','displays');
  const top=[...display.matchAll(/type=(?:statusBars|displayCutout) frame=\[0,0\]\[\d+,(\d+)\] visible=true[^\n]*sideHint=TOP/g)].map(m=>Number(m[1]));
  assert.ok(top.length,'Android reports a visible top system inset');inset=Math.max(...top);
  await check('native vertical scrolling in both directions',async()=>{
    await settings('scrolled');const before=await state();await swipe(0,-180);const forward=await state();assert.ok(forward.start>before.start+100);await swipe(0,150);const backward=await state();assert.ok(backward.start<forward.start-75);return{before,forward,backward};
  });
  await check('chapter edges, short chapters and non-linear sections',async()=>{
    await settings('scrolled');await c.evaluate(()=>{const r=document.querySelector('foliate-view').renderer;r.scrollBy(0,r.viewSize)});await sleep(400);
    const positions=[await state()];
    for(const[dy,index]of[[-180,2],[-180,3],[180,2],[180,0]]) {await swipe(0,dy);const position=await state();positions.push(position);assert.equal(position.index,index,JSON.stringify(positions))}
    assert.ok(positions.at(-1).extent-positions.at(-1).end<2);return positions;
  });
  for(const animation of ['slide','fade','none']) await check('native page turns with '+animation,async()=>{
    await settings('paginated',animation);const before=await state();await swipe(-220,0);const forward=await state();assert.ok(Math.abs(forward.start-before.start-before.size)<2,JSON.stringify({before,forward}));await swipe(220,0);const backward=await state();assert.ok(Math.abs(backward.start-before.start)<2,JSON.stringify({before,backward}));return{before,forward,backward};
  });
  await check('manual swipe after stopping auto-scroll',async()=>{
    await settings('scrolled');await c.click('.reader-top-actions [data-action=more]');await c.click('[data-reader-option=autoscroll]');await c.evaluate(()=>{for(const[key,value]of[['autoMode','pixel'],['autoSpeed','150']]){const el=document.querySelector(`[data-setting=${key}]`);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}});await c.click('#start-auto');await sleep(1800);await c.click('[data-auto-stop]');const before=await state();await swipe(0,-180);const after=await state();assert.ok(after.start-before.start>100);return{before,after};
  });
  const report={version,label,at:new Date().toISOString(),device:'Android 15 API 35 isolated emulator; adb finger gestures',checks};
  await writeFile(`docs/android-manual-scroll-${label}.json`,JSON.stringify(report,null,2)+'\n');
  assert.equal(checks.filter(x=>x.status==='failed').length,0,'Manual gesture regression failures');
}finally{c.close()}
