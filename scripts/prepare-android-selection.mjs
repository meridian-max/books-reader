// Establish the selection fixture explicitly; never depend on the last open book.
import {connect} from './android-cdp.mjs';
import {readFile} from 'node:fs/promises';
const c=await connect();
try {
  await c.poll(()=>!!document.querySelector('[data-tab=library]'));
  await c.evaluate(()=>document.querySelector('.close-modal')?.click());
  if(await c.evaluate(()=>document.body.classList.contains('reading'))){await c.click('[data-action=exit]');await c.poll(()=>!document.body.classList.contains('reading'))}
  await c.click('[data-tab=library]');
  await c.evaluate(base64=>{
    const bytes=Uint8Array.from(atob(base64),x=>x.charCodeAt(0));
    const files=new DataTransfer();files.items.add(new File([bytes],'alice.epub',{type:'application/epub+zip'}));
    const input=document.querySelector('#file-input');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  },(await readFile('public/samples/alice.epub')).toString('base64'));
  const id=await c.poll(()=>[...document.querySelectorAll('.book-card')].find(el=>/Alice.s Adventures in Wonderland|Alice in Wonderland/i.test(el.textContent))?.querySelector('[data-open]')?.dataset.open);
  await c.click(`[data-open="${id}"]`);
  await c.poll(()=>!!document.querySelector('foliate-view')?.book?.toc?.some(x=>/CHAPTER I\./.test(x.label)));
  console.log('Alice EPUB is open for native selection verification.');
}finally{c.close()}
