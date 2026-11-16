// Isolated Books_Test emulator only. --snapshot runs before installing the UI update.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {connect} from './android-cdp.mjs';
const adb=process.env.BOOKS_ADB||'/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb';
const serial=process.env.BOOKS_ADB_SERIAL||'emulator-5570';
assert.match(serial,/^emulator-/,'Use only an isolated emulator.');
const shell=(...args)=>execFileSync(adb,['-s',serial,'shell',...args],{encoding:'utf8'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const c=await connect(),checks=[];
const snapshotPath='/tmp/books-ui-before-upgrade.json';
async function snapshot(){return c.evaluate(async()=>{
 const values=await new Promise((resolve,reject)=>{const r=indexedDB.open('books-reader');r.onsuccess=()=>{const db=r.result,tx=db.transaction(['books','settings','marks']),b=tx.objectStore('books').getAll(),s=tx.objectStore('settings').get('reader'),m=tx.objectStore('marks').getAll();tx.oncomplete=()=>{resolve({books:b.result,settings:s.result,marks:m.result});db.close()};tx.onerror=()=>reject(tx.error)}});
 for(const book of values.books){const bytes=await book.blob.arrayBuffer();book.blob={bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}}
 return values;
})}
let inset=0,scale=1;
async function geometry(){
 shell('uiautomator','dump','/sdcard/books-comfort-ui.xml');
 const xml=shell('cat','/sdcard/books-comfort-ui.xml'),match=xml.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
 assert.ok(match);inset=Number(match[2]);scale=(Number(match[3])-Number(match[1]))/await c.evaluate(()=>innerWidth);
}
async function tap(selector){
 await c.evaluate(selector=>document.querySelector(selector)?.scrollIntoView({block:'nearest'}),selector);
 await sleep(120);
 const rect=await c.evaluate(selector=>{const el=document.querySelector(selector);if(!el)throw Error(selector);const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}},selector);
 assert.ok(rect.w&&rect.h,'Visible target: '+selector);
 shell('input','tap',String(Math.round(rect.x*scale)),String(Math.round(inset+rect.y*scale)));await sleep(250);
}
async function screenshot(name){await c.screenshot(`docs/screenshots/comfort/android-${name}.png`)}
try{
 await c.poll(()=>!!document.querySelector('[data-action=mobile-menu]'));
 if(process.argv.includes('--snapshot')){
   await c.evaluate(()=>document.querySelector('.close-modal')?.click());
   if(await c.evaluate(()=>document.body.classList.contains('reading'))) {await c.click('[data-action=exit]');await c.poll(()=>!document.body.classList.contains('reading'))}
   await writeFile(snapshotPath,JSON.stringify(await snapshot()));console.log('Saved old-installation settings, complete book metadata/content hashes and annotation records.');
 }else{
   const before=JSON.parse(await readFile(snapshotPath,'utf8')),after=await snapshot();
   assert.deepEqual(after,before);checks.push({name:'install-over-existing-app keeps complete book metadata/content, saved positions, annotations and preferences',status:'passed',books:after.books.length,marks:after.marks.length});
   await c.native('immersive',{value:false});await geometry();await mkdir('docs/screenshots/comfort',{recursive:true});
   await screenshot('home');
   await tap('[data-tab=library]');await c.poll(()=>!!document.querySelector('#library-search'));
   await screenshot('library');
   await tap('[data-tab=notebook]');await c.poll(()=>!!document.querySelector('.notebook-grid'));
   await screenshot('notes');
   await tap('[data-tab=settings]');await c.poll(()=>!!document.querySelector('#settings-search'));
   await screenshot('settings');
   await tap('#settings-search');shell('input','text','Automatically');await sleep(250);shell('input','keyevent','4');await sleep(250);
   assert.equal(await c.evaluate(()=>[...document.querySelectorAll('.settings-panel')].filter(x=>!x.hidden).length),1);
   const old=await c.evaluate(()=>document.querySelector('[data-setting=autoSync]').checked);
   await tap('.settings-panel:not([hidden]) .toggle-field');assert.equal(await c.evaluate(()=>document.querySelector('[data-setting=autoSync]').checked),!old);
   await tap('.settings-panel:not([hidden]) .toggle-field');
   checks.push({name:'four main tabs, native settings search and switch taps work',status:'passed'});
   await tap('[data-tab=home]');await c.poll(()=>!!document.querySelector('.continue-card'));
   await tap('.continue-copy [data-open]');await c.poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents().length);
   await c.native('immersive',{value:false});await geometry();
   assert.deepEqual(await c.evaluate(()=>[...document.querySelectorAll('.reader-tool')].map(x=>x.textContent.trim())),['Style','Chapters','Notes','Listen','More']);
   await tap('.reader-tool[data-action=appearance]');await c.poll(()=>!!document.querySelector('.reader-options'));
   await screenshot('style');await tap('.close-modal');
   await tap('.reader-tool[data-action=notes]');await c.poll(()=>!!document.querySelector('.marks-dialog'));await tap('.close-modal');
   await tap('.reader-tool[data-action=more]');await c.poll(()=>!!document.querySelector('[data-reader-option=autoscroll]'));await screenshot('reading-menu');await tap('.close-modal');
   checks.push({name:'named reading toolbar opens style, annotations and complete reading menu with native taps',status:'passed'});
   await screenshot('reader');
   await tap('[data-action=exit]');await tap('[data-tab=home]');await screenshot('home');
   const report={version:JSON.parse(await readFile('package.json','utf8')).version,at:new Date().toISOString(),device:'Android 15 / API 35 isolated emulator; real Android input taps',checks};
   await writeFile('docs/android-comfort-1.2.0.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }
}finally{c.close()}
