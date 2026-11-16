import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {connect} from './android-cdp.mjs';
import {manualScrollBook} from './manual-scroll-fixture.mjs';
const c=await connect(),checks=[];
const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const adb='/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb';
const shell=(...args)=>execFileSync(adb,['-s','emulator-5570','shell',...args],{encoding:'utf8'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const state=()=>c.evaluate(()=>{const r=document.querySelector('foliate-view').renderer;return{flow:r.getAttribute('flow'),start:r.start,size:r.size,index:r.getContents()[0].index}});
let inset=0;
const swipe=async(dy)=>{const point=await c.evaluate(()=>{const b=document.querySelector('foliate-view').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2,scale:1080/innerWidth}});shell('input','swipe',String(Math.round(point.x*point.scale)),String(inset+Math.round((point.y-dy/2)*point.scale)),String(Math.round(point.x*point.scale)),String(inset+Math.round((point.y+dy/2)*point.scale)),'420');await sleep(450)};
const tapMode=async()=>{const p=await c.evaluate(()=>{const b=document.querySelector('[data-action=toggle-flow]').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2,scale:1080/innerWidth}});shell('input','tap',String(Math.round(p.x*p.scale)),String(inset+Math.round(p.y*p.scale)));await sleep(450)};
async function library(){if(await c.evaluate(()=>document.body.classList.contains('reading'))){await c.click('[data-action=exit]');await c.poll(()=>!document.body.classList.contains('reading'))}await c.click('[data-action=mobile-menu]');await c.click('[data-nav=library]')}
async function open(id){await c.click(`[data-open="${id}"]`);await c.poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents().length);await c.native('immersive',{value:false});await sleep(350)}
try{
 await c.poll(()=>!!document.querySelector('[data-action=mobile-menu]'));
 const before=JSON.parse(await readFile('/tmp/books-before-1.1.4-upgrade-check.json','utf8'));
 const after=await c.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('books-reader');q.onsuccess=()=>{const db=q.result,tx=db.transaction(['settings','books','marks']),s=tx.objectStore('settings').get('reader'),b=tx.objectStore('books').getAll(),m=tx.objectStore('marks').getAll();tx.oncomplete=()=>{resolve({settings:s.result,books:b.result.map(x=>({id:x.id,location:x.location,bytes:x.blob.size})),marks:m.result});db.close()};tx.onerror=()=>reject(tx.error)}}));
 assert.equal(after.settings.flow,'scrolled');assert.equal(after.settings.readingModeVersion,1);
 assert.deepEqual(after.books,before.books);assert.deepEqual(after.marks,before.marks);
 for(const[key,value]of Object.entries(before.settings))if(key!=='flow')assert.deepEqual(after.settings[key],value,key);
 checks.push({name:'upgrade enables scrolling and retains all other settings, book data/locations and marks',status:'passed',books:after.books.length,marks:after.marks.length});
 let lastId;
 for(const format of ['epub','txt']){
  await library();const bytes=format==='epub'?manualScrollBook():Buffer.from('Mira read by the window. The story continued with another thought and a new adventure.\n\n'.repeat(150));
  const id=createHash('sha256').update(bytes).digest('hex');lastId=id;
  await c.evaluate(({base64,format})=>{const bytes=Uint8Array.from(atob(base64),x=>x.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([bytes],'Vertical reading.'+format,{type:format==='epub'?'application/epub+zip':'text/plain'}));const i=document.querySelector('#file-input');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}))},{base64:Buffer.from(bytes).toString('base64'),format});
  await c.poll(id=>!!document.querySelector(`[data-open="${id}"]`),id);await open(id);
  await c.evaluate(()=>document.querySelector('foliate-view').goTo(0));await sleep(400);
  shell('uiautomator','dump','/sdcard/books-mode-ui.xml');const match=shell('cat','/sdcard/books-mode-ui.xml').match(/class="android.webkit.WebView"[^>]*bounds="\[\d+,(\d+)\]/);assert.ok(match);inset=Number(match[1]);
  const initial=await state();assert.equal(initial.flow,'scrolled');await swipe(-180);const forward=await state();assert.ok(forward.start-initial.start>100);await swipe(150);const backward=await state();assert.ok(backward.start<forward.start-75);
  checks.push({name:'up/down swipes in '+format+' without changing reading settings',status:'passed',initial,forward,backward});
 }
 await tapMode();assert.equal((await state()).flow,'paginated');await library();await c.send('Page.reload');await c.poll(()=>!!document.querySelector('[data-action=mobile-menu]'));await library();await open(lastId);assert.equal((await state()).flow,'paginated');
 await tapMode();assert.equal((await state()).flow,'scrolled');const initial=await state();await swipe(-180);const forward=await state();assert.ok(forward.start-initial.start>100);
 checks.push({name:'visible mode switch works by real tap and explicit Pages choice survives restart',status:'passed',initial,forward});
 await c.screenshot(`docs/screenshots/android-reading-mode-${version}.png`);
 await writeFile(`docs/android-reading-mode-${version}.json`,JSON.stringify({version,device:'Android 15/API 35 isolated emulator; native finger gestures',checks},null,2)+'\n');console.log(JSON.stringify(checks,null,2));
}finally{c.close()}
