// Actual installed Android bridge and input tests; isolated Books_Test emulator only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {connect} from './android-cdp.mjs';
const adb='/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb',serial='emulator-5570';
const shell=(...args)=>execFileSync(adb,['-s',serial,'shell',...args],{encoding:'utf8'}),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const c=await connect(),checks=[];let scale=1,inset=0;
async function geometry(){shell('uiautomator','dump','/sdcard/books-reading-ui.xml');const xml=shell('cat','/sdcard/books-reading-ui.xml'),m=xml.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);assert.ok(m);inset=Number(m[2]);scale=(Number(m[3])-Number(m[1]))/await c.evaluate(()=>innerWidth)}
async function tap(selector){await c.evaluate(s=>document.querySelector(s)?.scrollIntoView({block:'nearest'}),selector);await sleep(120);const r=await c.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}},selector);assert.ok(r.w&&r.h,`Visible target: ${selector}`);shell('input','tap',String(Math.round(r.x*scale)),String(Math.round(inset+r.y*scale)));await sleep(220)}
try{
 await c.evaluate(()=>document.querySelector('.close-modal')?.click());
 await c.native('immersive',{value:false});await geometry();
 await c.poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents().length);
 await tap('.reader-tool[data-action=contents]');await tap('[data-reader-tab=images]');await c.poll(()=>!!document.querySelector('[data-image]'));await tap('[data-image="0"]');
 assert.equal(await c.evaluate(()=>Math.abs(document.querySelector('.gallery-preview').getBoundingClientRect().width-innerWidth)<1),true);
 assert.ok(await c.evaluate(async()=>{const image=document.querySelector('.gallery-preview img');await image.decode();return image.naturalWidth>0}));
 await mkdir('docs/screenshots/reading-1.5.0',{recursive:true});await c.screenshot('docs/screenshots/reading-1.5.0/android-image-viewer.png');
 await tap('[data-image-save]');await sleep(500);shell('uiautomator','dump','/sdcard/books-save-ui.xml');assert.ok(/com\.(?:google\.)?android\.documentsui/.test(shell('cat','/sdcard/books-save-ui.xml')),'Android save picker opened');for(let i=0;i<3;i++){shell('input','keyevent','4');await sleep(300);if(shell('dumpsys','activity','activities').split('\n').some(line=>/topResumedActivity/.test(line)&&line.includes('app.books.reader')))break}await geometry();await c.poll(()=>!!document.querySelector('.gallery-preview'));
 await tap('[data-gallery-back]');await tap('[data-reader-tab=bookmarks]');const count=await c.evaluate(()=>document.querySelectorAll('.navigator-mark').length);await tap('#navigator-add-bookmark');assert.notEqual(await c.evaluate(()=>document.querySelectorAll('.navigator-mark').length),count);await tap('#navigator-add-bookmark');assert.equal(await c.evaluate(()=>document.querySelectorAll('.navigator-mark').length),count);await tap('.close-modal');
 checks.push({name:'image gallery decodes offline, expands to full width, opens Android save picker, returns to sidebar and toggles bookmarks',status:'passed'});
 await tap('.reader-tool[data-action=appearance]');await tap('#browse-fonts');await tap('[data-reader-font=Manrope]');await c.poll(()=>{const d=document.querySelector('foliate-view')?.renderer?.getContents()[0]?.doc;return d&&d.fonts.check('20px BooksManrope')&&d.defaultView.getComputedStyle(d.querySelector('p')??d.body).fontFamily.includes('BooksManrope')});await c.screenshot('docs/screenshots/reading-1.5.0/android-font-library.png');await tap('[data-reader-font=Literata]');await tap('.close-modal');checks.push({name:'bundled Manrope and Literata apply in the Android chapter, with font browser taps',status:'passed'});
 const voices=await c.native('voices');assert.ok(voices.length);assert.ok(voices.every(v=>Number.isFinite(v.quality)&&typeof v.network==='boolean'));
 await c.evaluate(()=>{window.__readingEvents=[];window.addEventListener('native:speech',e=>window.__readingEvents.push(e.detail));});
 const href=await c.evaluate(()=>document.querySelector('foliate-view').book.toc.find(x=>/CHAPTER I\./.test(x.label)).href);await c.evaluate(href=>document.querySelector('foliate-view').goTo(href),href);
 await tap('.reader-tool[data-action=speech]');await c.poll(()=>!document.querySelector('#start-speech')?.disabled);const voice=voices.find(v=>v.language.startsWith('en')&&!v.network)??voices[0];
 await c.evaluate(name=>{const el=document.querySelector('#tts-voice');el.value=name;el.dispatchEvent(new Event('change',{bubbles:true}))},voice.name);
 const preview=await c.native('previewVoice',{text:'The next chapter is ready. Welcome to Books.',voice:voice.name,rate:1,pitch:1});assert.equal(preview,true);await c.native('stopVoicePreview');
 await tap('#start-speech');await c.poll(()=>window.__readingEvents.some(e=>e.state==='playing'),undefined,30000);
 await tap('[data-action=speech-pause]');await c.poll(()=>window.__readingEvents.some(e=>e.state==='paused'));const before=await c.evaluate(()=>window.__readingEvents.filter(e=>e.state==='paused').at(-1).index);
 await tap('[data-action=speech-next]');await c.poll(before=>window.__readingEvents.some(e=>e.state==='playing'&&e.index>before),before);
 await tap('[data-action=speech-pause]');await c.poll(()=>document.querySelector('.tts-now-playing').getBoundingClientRect().height<210);assert.ok(await c.evaluate(()=>[...document.querySelectorAll('.tts-transport svg')].every(el=>el.getBoundingClientRect().width>=17)));await c.poll(()=>!document.querySelector('#toast')?.classList.contains('visible'));await c.screenshot('docs/screenshots/reading-1.5.0/android-read-aloud.png');
 const events=await c.evaluate(()=>window.__readingEvents);await tap('[data-action=speech-stop]');await c.poll(()=>!document.querySelector('.tts-now-playing'));
 checks.push({name:'native installed voice metadata, voice preview and read-aloud play/pause/next/stop',status:'passed',voiceCount:voices.length,voice:voice.name,wordTimingsReported:events.some(e=>e.state==='range'),states:[...new Set(events.map(e=>e.state))]});
 const report={version:JSON.parse(await readFile('package.json','utf8')).version,at:new Date().toISOString(),device:'Android 15 API 35 test emulator; Android input taps and installed speech engine',checks};await writeFile(`docs/android-reading-experience-${report.version}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await c.native('stopVoicePreview').catch(()=>{});await c.native('speechControl',{action:'stop'}).catch(()=>{});c.close()}
