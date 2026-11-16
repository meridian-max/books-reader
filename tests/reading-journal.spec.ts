import { test, expect, type Page } from '@playwright/test';
import { appThemes } from '../src/types';

async function seed(page: Page, count = 6) {
  await page.goto('/'); await page.locator('.welcome-card').waitFor();
  await page.evaluate(async count => {
    const d = await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('books-reader');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    const tx=d.transaction(['books','marks','sessions'],'readwrite');
    for(let i=0;i<2;i++)tx.objectStore('books').put({id:`journal-book-${i}`,title:i?'The Long Way Home':'A Book of Quiet Places',author:i?'Leena Rao':'Mira Hart',filename:`journal-${i}.txt`,format:'txt',added:100,lastRead:500-i,progress:.25,location:0,cover:'',tags:['Evening reading'],favorite:false,rating:0,finished:false,seconds:720,words:2000,size:6000,blob:new Blob(['The morning light filled the quiet room. She opened her book and began to read.\n\n'.repeat(160)],{type:'text/plain'})});
    for(let i=0;i<count;i++)tx.objectStore('marks').put({id:`journal-mark-${i}`,bookId:`journal-book-${i%2}`,type:i%6===5?'bookmark':i%6===4?'note':'highlight',style:['Highlight','Underline','StrikeOut','Squiggly'][i%4],quote:i%6===5?'':`Saved thought ${i}. A small moment, held between the pages.${i===2?' Many more words. '.repeat(90):''}`,note:i%6===4?'Remember the quiet morning.':'',color:['#e2c96a','#99c6ab','#a7bce4','#d7b2d1'][i%4],location:0,created:Date.now()-i*1000,updated:Date.now()-i*1000});
    tx.objectStore('marks').put({id:'deleted-mark',bookId:'journal-book-0',type:'highlight',quote:'Deleted words must not return',note:'',color:'#fff',location:0,created:Date.now()+1000,updated:Date.now(),deleted:true});
    tx.objectStore('sessions').put({id:'journal-session',bookId:'journal-book-0',date:'2026-11-16',seconds:720,words:2000});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});d.close();
  },count);
  await page.reload(); await page.locator('.home-margins').waitFor();
}
async function fit(page:Page, selector='#page') {
  expect(await page.locator(selector).evaluate(e=>e.scrollWidth <= e.clientWidth+1)).toBe(true);
  expect(await page.evaluate(()=>document.body.scrollWidth <= innerWidth+1)).toBe(true);
}
test('Home remembers real saved words, steps manually, and opens their book',async({page})=>{
  await page.setViewportSize({width:412,height:850});await seed(page);
  await expect(page.locator('.margin-content')).toContainText('Saved thought 0.');
  await expect(page.locator('.home-margins')).not.toContainText('Deleted words');
  await expect(page.locator('[data-margin-step="-1"]')).toBeDisabled();
  await page.locator('[data-margin-step="1"]').click();
  await expect(page.locator('.margin-content')).toContainText('Saved thought 1.');
  await expect(page.locator('.margin-content .saved-passage')).toHaveAttribute('data-ink','Underline');
  await expect(page.locator('.margin-position')).toHaveText('2 of 5 saved passages');
  await page.locator('[data-margin-open]').click();
  await page.waitForFunction(()=>!!(document.querySelector('foliate-view') as any)?.renderer?.getContents().length);
  await expect(page.locator('#reader')).toBeVisible();
  await page.locator('[data-action=exit]').click();
  await expect(page.locator('#reader')).toBeHidden();
});
test('Book portrait saves favorite and rating, filters its notes, and restores its controls',async({page})=>{
  await page.setViewportSize({width:412,height:850});await seed(page);
  await page.locator('.home-book-details').click();
  await expect(page.locator('[data-saved-count]')).toHaveText('3 saved items');
  await expect(page.locator('[data-reading-time]')).toHaveText('12 min reading');
  await expect(page.locator('.portrait-passages .portrait-passage')).toHaveCount(2);
  await page.locator('[data-book-action=favorite]').click();
  await expect(page.locator('[data-book-action=favorite]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-rating="4"]').click();
  await expect(page.locator('[data-rating="4"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('.close-modal').click();
  await page.reload();await page.locator('.home-book-details').click();
  await expect(page.locator('[data-book-action=favorite]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-rating="4"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-rating="4"]').click();
  await expect(page.locator('.rating-picker .rated')).toHaveCount(0);
  await page.locator('[data-book-notes]').click();
  await expect(page.locator('.journal-book-filter select')).toHaveValue('journal-book-0');
  await expect(page.locator('.journal-entry')).toHaveCount(3);
  await page.locator('[data-tab=home]').click();await page.locator('.home-book-details').click();
  await page.locator('.portrait-manage summary').click();
  await page.locator('[data-book-action=edit]').click();
  await expect(page.locator('#edit-book')).toBeVisible();
});
test('Journal searches every saved item, filters styles and notes, and pages large collections',async({page})=>{
  await seed(page,73);await page.locator('[data-tab=notebook]').click();
  await expect(page.locator('.journal-entry')).toHaveCount(24);
  await expect(page.locator('.journal-count')).toHaveText('73 saved items');
  await page.locator('.journal-more').click();await expect(page.locator('.journal-entry')).toHaveCount(48);
  await page.locator('.journal-search input').fill('thought 72.');
  await expect(page.locator('.journal-entry')).toHaveCount(1);
  await expect(page.locator('.journal-entry')).toContainText('Saved thought 72.');
  await page.locator('.journal-search input').fill('wavy');
  await expect(page.locator('.journal-count')).toHaveText('12 saved items found');
  await page.locator('.journal-search input').fill('');
  await page.locator('[data-journal-kind=note]').click();
  await expect(page.locator('.journal-count')).toHaveText('12 saved items');
  await page.locator('[data-journal-kind=bookmark]').click();
  await expect(page.locator('.journal-count')).toHaveText('12 saved items');
  await page.locator('.journal-search input').fill('not in this library');
  await expect(page.locator('.journal-empty h2')).toHaveText('No matching passages');
  await page.locator('[data-journal-reset]').click();
  await expect(page.locator('.journal-count')).toHaveText('73 saved items');
});
test('Edited and cleared notes persist, deletion stays deleted, empty state works',async({page})=>{
  await seed(page,1);await page.locator('[data-tab=notebook]').click();
  await page.locator('[data-note-edit]').click();await page.locator('#input-dialog input').fill('A thought of my own.');await page.locator('#input-dialog button').click();
  await expect(page.locator('.journal-thought')).toHaveText('A thought of my own.');
  await page.reload();await page.locator('[data-tab=notebook]').click();
  await expect(page.locator('.journal-thought')).toHaveText('A thought of my own.');
  await page.locator('[data-note-edit]').click();await page.locator('#input-dialog input').fill('');await page.locator('#input-dialog button').click();
  await expect(page.locator('.journal-thought')).toHaveCount(0);
  await page.locator('[data-note-remove]').click();await expect(page.locator('.journal-empty')).toBeVisible();
  await page.reload();await expect(page.locator('.home-margins')).toHaveCount(0);
  await page.locator('[data-tab=notebook]').click();await expect(page.locator('.journal-count')).toHaveText('0 saved items');
});
for(const width of [320,412,768,1100])test(`Book portrait and journal fit ${width}px, including long passages and focus`,async({page})=>{
  await page.setViewportSize({width,height:850});await seed(page);
  await page.locator('.home-book-details').click();await fit(page,'.modal-body');
  for(const el of await page.locator('.portrait-rating button,.portrait-favorite,.portrait-read,.close-modal').all()) {
    const box=await el.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(47.9);expect(box!.height).toBeGreaterThanOrEqual(47.9);
  }
  await page.keyboard.press('Escape');await expect(page.locator('.home-book-details')).toBeFocused();
  await page.locator('[data-tab=notebook]').click();await fit(page);
  await expect(page.locator('[data-mark-id=journal-mark-2] blockquote')).toContainText('Many more words.');
  await page.locator('.journal-search input').fill('quiet');await fit(page);
});
test('Passage changes respect system and app reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await seed(page);
  await page.locator('[data-margin-step="1"]').click();
  expect(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>document.documentElement.dataset.motion='reduced');
  await page.locator('[data-margin-step="1"]').click();
  expect(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
});

test('All 27 themes retain readable saved ink and controls',async({page})=>{
  await seed(page);await page.locator('[data-tab=notebook]').click();
  await page.locator('.journal-entry').first().waitFor();
  for(const theme of Object.keys(appThemes)) {
    const ratios=await page.evaluate(theme=>{
      document.documentElement.dataset.appTheme=theme;
      const ctx=document.createElement('canvas').getContext('2d')!;
      const rgb=(css:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=css;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data)};
      const lum=(values:number[])=>{const v=values.slice(0,3).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722};
      const ratio=(a:number[],b:number[])=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
      const root=getComputedStyle(document.documentElement), surface=rgb(root.getPropertyValue('--app-surface'));
      const span=document.querySelector('.saved-passage[data-ink=Highlight] > span')!;
      const style=getComputedStyle(span),ink=rgb(style.color),tint=rgb(style.backgroundColor);
      const blended=tint.slice(0,3).map((c,i)=>c*(tint[3]/255)+surface[i]*(1-tint[3]/255));
      return {highlight:ratio(ink,blended),secondary:ratio(rgb(root.getPropertyValue('--app-secondary')),surface)};
    },theme);
    expect(ratios.highlight,`${theme} saved passage`).toBeGreaterThanOrEqual(4.5);
    expect(ratios.secondary,`${theme} saved item labels`).toBeGreaterThanOrEqual(4.5);
  }
});

test('Reading pick avoids immediate repeats, remembers its choice and opens the selected book',async({page})=>{
  await page.setViewportSize({width:412,height:850});await seed(page);
  await expect(page.locator('.pick-result h3')).toHaveText('Let your shelf surprise you.');
  await page.locator('[data-pick-shuffle]').click();
  const first=await page.locator('[data-pick-read]').getAttribute('data-open');
  await page.locator('[data-pick-shuffle]').click();
  const next=await page.locator('[data-pick-read]').getAttribute('data-open');
  expect(next).not.toBe(first);
  await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('books-reader');r.onsuccess=()=>{const d=r.result,q=d.transaction('settings').objectStore('settings').get('reading-pick');q.onsuccess=()=>{resolve(q.result);d.close()}}}))).toBe(next);
  await page.reload();await expect(page.locator('[data-pick-read]')).toHaveAttribute('data-open',next!);
  await fit(page);await page.locator('[data-pick-read]').click();
  await page.waitForFunction(()=>!!(document.querySelector('foliate-view') as any)?.renderer?.getContents().length);
  await expect(page.locator('#reader')).toBeVisible();
});

test('Reading pick prefers unread books and handles one-book and empty libraries honestly',async({page})=>{
  await page.goto('/');await page.locator('.welcome-card').waitFor();
  await expect(page.locator('.home-reading-pick')).toHaveCount(0);
  await seed(page);
  await page.evaluate(async()=>{const d=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('books-reader');r.onsuccess=()=>resolve(r.result)});const tx=d.transaction('books','readwrite'),store=tx.objectStore('books'),q=store.get('journal-book-1');q.onsuccess=()=>store.put({...q.result,lastRead:0,progress:0});await new Promise(resolve=>tx.oncomplete=resolve);d.close()});
  await page.reload();
  await expect(page.locator('.pick-pool')).toHaveText('1 unread book on your shelf');
  await expect(page.locator('.pick-result h3')).toHaveText('The Long Way Home');
  await expect(page.locator('[data-pick-shuffle]')).toBeHidden();
  await expect(page.locator('[data-pick-read]')).toBeVisible();
});
