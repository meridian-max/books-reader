// Run only on the isolated Books test emulator, before installing the update.
import {writeFile} from 'node:fs/promises';
import {connect} from './android-cdp.mjs';
const c=await connect();
try {
  await c.evaluate(()=>document.querySelector('.close-modal')?.click());
  if(await c.evaluate(()=>document.body.classList.contains('reading'))){
    await c.click('[data-action=exit]');
    await c.poll(()=>!document.body.classList.contains('reading'));
  }
  const snapshot=await c.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('books-reader');
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction(['settings','books','marks'],'readwrite');
      const settingsRequest=tx.objectStore('settings').get('reader');
      const books=tx.objectStore('books').getAll(),marks=tx.objectStore('marks').getAll();
      let settings;
      settingsRequest.onsuccess=()=>{
        settings=settingsRequest.result;
        settings.flow='paginated';
        delete settings.readingModeVersion;
        tx.objectStore('settings').put(settings,'reader');
      };
      tx.oncomplete=()=>{
        resolve({settings,books:books.result.map(x=>({id:x.id,location:x.location,bytes:x.blob.size})),marks:marks.result});
        db.close();
      };
      tx.onerror=()=>reject(tx.error);
    };
  }));
  await writeFile('/tmp/books-before-1.1.4-upgrade-check.json',JSON.stringify(snapshot));
  console.log('Prepared legacy page mode and saved isolated test-library snapshot.');
} finally {c.close()}
