// Only Books_Test. Requires Google Speech and the official Sherpa/Piper test engine.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {connect} from './android-cdp.mjs';
const adb='/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb';
const serial='emulator-5570';
assert.match(execFileSync(adb,['-s',serial,'emu','avd','name'],{encoding:'utf8'}),/Books_Test/);
const shell=(...args)=>execFileSync(adb,['-s',serial,'shell',...args],{encoding:'utf8'});
const c=await connect(),checks=[];
const piper='com.k2fsa.sherpa.onnx.tts.engine',google='com.google.android.tts';
try{
 const engines=await c.native('voiceEngines');
 assert.ok(engines.some(e=>e.name===piper)&&engines.some(e=>e.name===google));
 const g=await c.native('voices',{engine:google}),p=await c.native('voices',{engine:piper});
 assert.ok(g.length>10&&p.length>0);
 const gv=g.find(v=>v.language==='en-US'&&!v.network&&v.installed),pv=p.find(v=>!v.network&&v.installed);
 assert.ok(gv&&pv);
 checks.push({name:'Separate installed-provider discovery with real voice metadata',engines,googleVoices:g.length,piperVoices:p.length});
 await assert.rejects(c.native('voices',{engine:'app.books.nonexistent'}),/not installed/);
 await assert.rejects(c.native('previewVoice',{engine:piper,voice:'missing-voice',text:'Test.'}),/unavailable/);
 checks.push({name:'Missing provider and stale voice rejected rather than silently reading with another voice'});
 // Both engines must synthesize to completion with networking disabled on this emulator.
 shell('svc','wifi','disable');shell('svc','data','disable');
 for (const [engine,voice] of [[piper,pv.name],[google,gv.name]]) {
  assert.equal(await c.native('previewVoice',{engine,voice,text:'Every book opens a door. Your next chapter is ready.',rate:1,pitch:1}),true);
  checks.push({name:'Real offline voice preview completed',engine,voice});
 }
 await c.evaluate(()=>{
  window.__voiceEvents=[];window.addEventListener('native:speech',e=>window.__voiceEvents.push(e.detail));
  const data=new DataTransfer();data.items.add(new File(['A quiet beginning. The sun rose over the garden. We opened the book and listened to a new story.\n\nThe next chapter was waiting. '.repeat(100)],'Voice test.txt',{type:'text/plain'}));
  const input=document.querySelector('#file-input');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await c.poll(()=>!!document.querySelector('.book-cover-button'));
 await c.click('.book-cover-button');
 await c.poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents().length);
 await c.click('[data-action=speech]');
 await c.poll(()=>document.querySelector('#tts-engine')?.options.length>=3);
 await c.evaluate(engine=>{const el=document.querySelector('#tts-engine');el.value=engine;el.dispatchEvent(new Event('change',{bubbles:true}))},piper);
 await c.poll(()=>!document.querySelector('#start-speech').disabled);
 await c.evaluate(voice=>{const el=document.querySelector('#tts-voice');el.value=voice;el.dispatchEvent(new Event('change',{bubbles:true}))},pv.name);
 await c.click('#preview-voice');
 await c.poll(()=>document.querySelector('#preview-voice').textContent.includes('Stop preview'));
 await c.click('#preview-voice');
 await c.poll(()=>document.querySelector('#preview-voice').textContent.includes('Preview voice'));
 checks.push({name:'Real in-app preview can be cancelled without starting book playback'});
 await c.click('.close-modal');await c.click('[data-action=speech]');
 await c.poll(({engine,voice})=>document.querySelector('#tts-engine')?.value===engine&&document.querySelector('#tts-voice')?.value===voice,{engine:piper,voice:pv.name});
 await c.click('#start-speech');
 await c.poll(()=>window.__voiceEvents.some(e=>e.state==='playing'),undefined,30000);
 await c.click('[data-action=speech-pause]');
 await c.poll(()=>window.__voiceEvents.at(-1)?.state==='paused');
 await c.click('[data-action=speech-pause]');
 await c.poll(()=>window.__voiceEvents.at(-1)?.state==='playing',undefined,30000);
 shell('input','keyevent','223');
 await c.poll(()=>window.__voiceEvents.filter(e=>e.state==='playing').some(e=>e.index>=2),undefined,45000);
 shell('input','keyevent','224');shell('wm','dismiss-keyguard');
 await c.click('[data-action=speech-stop]');
 await c.poll(()=>!document.querySelector('.tts-now-playing'));
 checks.push({name:'Selected Piper engine plays book offline, pauses/resumes, advances with screen off, and stops',states:await c.evaluate(()=>[...new Set(window.__voiceEvents.map(e=>e.state))])});
 await c.click('[data-action=exit]');
 await c.send('Page.reload');await c.poll(()=>!!document.querySelector('[data-tab=library]'));await c.click('[data-tab=library]');
 await c.click('.book-cover-button');await c.poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents().length);await c.click('[data-action=speech]');
 await c.poll(({engine,voice})=>document.querySelector('#tts-engine')?.value===engine&&document.querySelector('#tts-voice')?.value===voice,{engine:piper,voice:pv.name});
 checks.push({name:'Provider and voice persist across WebView restart'});
 await c.evaluate(()=>{document.querySelector('#tts-engine').scrollIntoView({block:'start'})});
 await c.screenshot('docs/screenshots/reading-1.5.2/android-voices.png');
 const report={version:'1.5.2',at:new Date().toISOString(),device:'Isolated Android 15 x86_64 Books_Test emulator; no physical phone installation',checks};
 await mkdir('docs/verification-1.5.2',{recursive:true});await writeFile('docs/verification-1.5.2/android-voices.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{
 shell('svc','wifi','enable');shell('svc','data','enable');shell('input','keyevent','224');
 await c.native('stopVoicePreview').catch(()=>{});await c.native('speechControl',{action:'stop'}).catch(()=>{});c.close();
}
