import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {connect} from "./android-cdp.mjs";
const c = await connect();
try {
  await c.send("Page.reload");
  await c.poll(()=>!!document.querySelector('[data-action=mobile-menu]'));
  await c.click('[data-nav=library]');
  await c.evaluate(()=>[...document.querySelectorAll('.book-title')].find(x=>x.textContent.includes('ftp-reading')).click());
  await c.poll(()=>!!document.querySelector('foliate-view')?.renderer?.getContents()?.length);
  const quote=await c.evaluate(()=>{
    window.__selectedSpeechEvents=[];
    window.__selectedSpeechListener=e=>window.__selectedSpeechEvents.push(e.detail);
    window.addEventListener('native:speech',window.__selectedSpeechListener);
    const doc=document.querySelector('foliate-view').renderer.getContents()[0].doc;
    const p=[...doc.querySelectorAll('p')].find(p=>p.textContent.trim().length>40);
    const range=doc.createRange();range.selectNodeContents(p);
    const selection=doc.getSelection();selection.removeAllRanges();selection.addRange(range);
    doc.dispatchEvent(new Event('selectionchange'));
    return p.textContent.trim();
  });
  await c.poll(()=>!document.querySelector('#selection-tools').hidden);
  await c.click('[data-selection=more]');
  await c.click('[data-selection-extra=speak]');
  await c.poll(()=>window.__selectedSpeechEvents.some(e=>e.state==='playing'));
  await c.poll(()=>window.__selectedSpeechEvents.some(e=>e.state==='finished'),undefined,20000);
  const played=await c.evaluate(()=>window.__selectedSpeechEvents.filter(e=>e.state==='playing').map(e=>e.text));
  assert.equal(played.join(' ').replace(/\s+/g,' ').trim(),quote.replace(/\s+/g,' '));
  await c.poll(()=>!document.querySelector('.tts-now-playing'));
  await writeFile('docs/android-selected-speech-1.1.0-results.json',JSON.stringify({at:new Date().toISOString(),status:'passed',quote,played,boundary:'Actual Android speech callbacks and queue completion; physical audible output was not tested'},null,2)+'\n');
  console.log('PASS selected-passage speech plays only the selected text and completes.');
} finally {
  await c.evaluate(()=>{if(window.__selectedSpeechListener)window.removeEventListener('native:speech',window.__selectedSpeechListener)});
  c.close();
}
