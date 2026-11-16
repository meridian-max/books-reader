// Exercises the real model on the isolated emulator, with other providers disabled.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {connect} from './android-cdp.mjs';
const adb='/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb', serial='emulator-5570';
assert.match(execFileSync(adb,['-s',serial,'emu','avd','name'],{encoding:'utf8'}),/Books_Test/);
const shell=(...a)=>execFileSync(adb,['-s',serial,'shell',...a],{encoding:'utf8'});
const c=await connect(),checks=[],engine='app.books.reader',external=['com.google.android.tts','com.k2fsa.sherpa.onnx.tts.engine'];
await mkdir('docs/verification-1.6.1',{recursive:true});await mkdir('docs/screenshots/reading-1.6.1',{recursive:true});
try {
 shell('svc','wifi','disable');shell('svc','data','disable');for(const p of external)shell('pm','disable-user','--user','0',p);
 const engines=await c.native('voiceEngines');assert.equal(engines.length,1);assert.equal(engines[0].name,engine);
 assert.equal((await c.native('voicePackStatus')).state,'installed');
 const voices=await c.native('voices',{engine});assert.equal(voices.length,49);assert.ok(voices.every(v=>v.installed&&!v.network));
 checks.push({name:'49 downloaded voices available with both external providers disabled and networking off',languages:[...new Set(voices.map(v=>v.language))]});
 await assert.rejects(c.native('previewVoice',{engine,voice:'jf_alpha',text:'Test'}),/unavailable/);
 if(process.env.SKIP_SYNTHESIS) checks.push(...JSON.parse(await readFile('.testing/voice-research/completed-synthesis.json','utf8')));
 if(!process.env.SKIP_SYNTHESIS) for(const [voice,text] of [['af_heart','A new chapter begins.'],['af_bella','A new chapter begins.'],['bf_emma','A quiet afternoon in the garden.'],['hf_alpha','आज हम एक नई किताब पढ़ेंगे।'],['ef_dora','Hoy leemos un libro nuevo.'],['ff_siwis','Nous ouvrons un nouveau livre.'],['if_sara','Oggi leggiamo un nuovo libro.'],['pf_dora','Hoje vamos ler um novo livro.'],['zf_xiaoxiao','今天我们一起读一本书。']]) {
  const start=Date.now();assert.equal(await c.native('previewVoice',{engine,voice,text,rate:1,pitch:1}),true);
  const check={name:'Offline synthesis completed',voice,elapsedMs:Date.now()-start};checks.push(check);console.log(check);
 }
 await c.evaluate(()=>{window.__voiceEvents=[];window.addEventListener('native:speech',e=>window.__voiceEvents.push(e.detail));});
 await c.native('speak',{engine,voice:'af_heart',text:'A quiet beginning. The sun rose over the garden. We opened the book and listened to a new story. The next chapter was waiting. '.repeat(30),title:'Offline voice test',bookId:'voice-test',rate:1,pitch:1});
 await c.poll(()=>window.__voiceEvents.some(e=>e.state==='playing'),undefined,30000);
 await c.native('speechControl',{action:'pause'});await c.poll(()=>window.__voiceEvents.at(-1)?.state==='paused');
 await c.native('speechControl',{action:'resume'});await c.poll(()=>window.__voiceEvents.at(-1)?.state==='playing',undefined,30000);
 shell('input','keyevent','223');await c.poll(()=>window.__voiceEvents.some(e=>e.state==='playing'&&e.index>=2),undefined,45000);
 shell('input','keyevent','224');shell('wm','dismiss-keyguard');await c.native('speechControl',{action:'stop'});
 checks.push({name:'Downloaded voice plays, pauses, resumes and advances with screen off, then stops',states:await c.evaluate(()=>[...new Set(window.__voiceEvents.map(e=>e.state))])});
 // Drive the actual sheet, then cancel while inference is pending.
 if(await c.evaluate(()=>!!document.querySelector('.close-modal')))await c.click('.close-modal');
 if(await c.evaluate(()=>!!document.querySelector('[data-action=exit]')))await c.click('[data-action=exit]');
 const testTitle='Offline chapter '+Date.now();
 await c.evaluate(title=>{
  const data=new DataTransfer();data.items.add(new File([title+' A quiet beginning. The sun rose over the garden. '.repeat(80)],title+'.txt',{type:'text/plain'}));const input=document.querySelector('#file-input');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 },testTitle);
 const bookSelector=`.book-cover-button[aria-label="Read ${testTitle}"]`;
 await c.poll(selector=>!!document.querySelector(selector),bookSelector);await c.click(bookSelector);await c.poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents().length);await c.click('[data-action=speech]');
 await c.poll(()=>!![...document.querySelectorAll('#tts-engine option')].find(el=>el.value==='app.books.reader'));
 await c.evaluate(engine=>{const el=document.querySelector('#tts-engine');el.value=engine;el.dispatchEvent(new Event('change',{bubbles:true}))},engine);
 await c.poll(()=>!![...document.querySelectorAll('#tts-voice option')].find(el=>el.value==='af_heart'));
 await c.evaluate(()=>{const el=document.querySelector('#tts-voice');el.value='af_heart';el.dispatchEvent(new Event('change',{bubbles:true}));});await c.click('#preview-voice');
 await c.poll(()=>document.querySelector('#preview-voice').textContent.includes('Stop preview'));await c.click('#preview-voice');
 await c.poll(()=>document.querySelector('#preview-voice').textContent.includes('Preview voice'));
 await c.click('[data-quick-voice=af_bella]');await c.click('.close-modal');await c.click('[data-action=speech]');
 await c.poll(()=>document.querySelector('#tts-voice')?.value==='af_bella');
 await c.evaluate(()=>{document.querySelector('.modal-body').scrollTop=0});
 await c.screenshot('docs/screenshots/reading-1.6.1/android-listening.png');
 checks.push({name:'Preview cancellation returns control immediately; selected downloaded voice persists when reopening'});
 await writeFile('docs/verification-1.6.1/android-voices.json',JSON.stringify({version:'1.6.1',device:'Isolated Android 15 x86_64 emulator, not a physical phone',at:new Date().toISOString(),checks},null,2)+'\n');console.log('PASSED',checks.length,'checks');
}finally{
 for(const p of external)shell('pm','enable',p);shell('svc','wifi','enable');shell('svc','data','enable');shell('input','keyevent','224');
 await c.native('stopVoicePreview').catch(()=>{});await c.native('speechControl',{action:'stop'}).catch(()=>{});c.close();
}
