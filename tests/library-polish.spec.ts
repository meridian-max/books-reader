import { test, expect, type Page } from '@playwright/test';
async function seed(page: Page, count = 125) {
  await page.goto('/'); await page.locator('.welcome-card').waitFor();
  await page.evaluate(async count => {
    const d = await new Promise<IDBDatabase>((resolve,reject)=>{ const r=indexedDB.open('books-reader'); r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error) });
    const tx = d.transaction('books','readwrite');
    for(let i=0;i<count;i++) tx.objectStore('books').put({id:`polish-${i}`,title:`${i % 2 ? 'Evening stories' : 'Quiet mornings'} ${String(i).padStart(3,'0')}`,author:'Mira Hart',filename:`story-${i}.txt`,format:'txt',added:count-i,lastRead:0,progress:0,location:'',cover:'',tags:[],favorite:false,rating:0,finished:false,seconds:0,words:1000,size:6000,blob:new Blob(['The morning light filled the quiet room. She opened her book and began to read.\n\n'.repeat(160)],{type:'text/plain'})});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});d.close();
  }, count);
  await page.reload(); await page.locator('.continue-card').waitFor();
  await page.locator('[data-tab=library]').click();
}
async function overflow(page: Page) {
  expect(await page.evaluate(()=>document.body.scrollWidth > innerWidth+1 || document.querySelector('#page')!.scrollWidth > document.querySelector('#page')!.clientWidth+1)).toBe(false);
}
test('large library loads batches while searching every book, and returns to its place', async({page})=>{
  await page.setViewportSize({width:412,height:850}); await seed(page);
  await expect(page.locator('.book-card')).toHaveCount(24);
  await expect(page.locator('.library-result-count')).toHaveText('125 books');
  await page.locator('#library-search').fill('stories 123');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-title')).toHaveText('Evening stories 123');
  await page.locator('[data-action=close-search]').click();
  await page.locator('.library-more').evaluate((b:HTMLButtonElement)=>b.click());
  await expect(page.locator('.book-card')).toHaveCount(48);
  await page.locator('#page').evaluate(p=>p.scrollTop=2200);
  const top=await page.locator('#page').evaluate(p=>p.scrollTop);
  await page.locator('[data-tab=home]').click();await page.locator('.continue-card').waitFor();
  await page.locator('[data-tab=library]').click();
  await expect(page.locator('.book-card')).toHaveCount(48);
  await expect.poll(()=>page.locator('#page').evaluate(p=>p.scrollTop)).toBe(top);
  await page.locator('#library-search').fill('Evening stories');
  await expect(page.locator('.library-result-count')).toHaveText('62 books found');
  await page.locator('[data-tab=notebook]').click();await page.locator('[data-tab=library]').click();
  await expect(page.locator('#library-search')).toHaveValue('Evening stories');
  await expect(page.locator('.library-result-count')).toHaveText('62 books found');
});
test('bulk selection includes unloaded matches and single selection preserves cards', async({page})=>{
  await page.setViewportSize({width:412,height:850});await seed(page);
  await page.locator('[data-action=app-menu]').click();await page.locator('[data-menu-action=select-books]').click();
  const first=page.locator('.book-card').first();await first.evaluate(el=>(el as HTMLElement).dataset.testRetained='yes');
  await page.locator('[data-select-book]').first().check();
  await expect(first).toHaveAttribute('data-test-retained','yes');
  await expect(page.locator('.bulk-books > span')).toHaveText('1 selected');
  await page.locator('[data-bulk=all]').click();
  await expect(page.locator('.bulk-books > span')).toHaveText('125 selected');
  await page.locator('[data-bulk=favorite]').click();
  await expect(page.locator('.bulk-books')).toHaveCount(0);
  const favorites=await page.evaluate(()=>new Promise<number>(resolve=>{const r=indexedDB.open('books-reader');r.onsuccess=()=>{const db=r.result,q=db.transaction('books').objectStore('books').getAll();q.onsuccess=()=>{resolve(q.result.filter(b=>b.favorite).length);db.close()}}}));
  expect(favorites).toBe(125);
});
test('closing a real text book restores shelf position',async({page})=>{
  await page.setViewportSize({width:412,height:850});await seed(page,32);
  const card=page.locator('.book-card').nth(12);await card.scrollIntoViewIfNeeded();
  const top=await page.locator('#page').evaluate(p=>p.scrollTop);
  await card.locator('.book-cover-button').click();
  await page.waitForFunction(()=>!!(document.querySelector('foliate-view') as any)?.renderer?.getContents().length);
  await page.locator('[data-action=exit]').click();
  await expect(page.locator('#reader')).toBeHidden();
  await expect.poll(()=>page.locator('#page').evaluate(p=>p.scrollTop)).toBe(top);
});
for(const width of [320,412,768,1100])test(`polished layout fits ${width}px, with readable type and complete touch targets`,async({page})=>{
  await page.setViewportSize({width,height:850});await seed(page,4);await overflow(page);
  for(const el of await page.locator('.book-more,.main-appbar .appbar-button,.bottom-nav button').all()){
    const box=await el.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(47.9);expect(box!.height).toBeGreaterThanOrEqual(47.9);
  }
  const cover=await page.locator('.book-cover').first().getAttribute('src');
  await page.locator('[data-tab=home]').click();await page.locator('.continue-card').waitFor();await overflow(page);
  await expect(page.locator('.week-day')).toHaveCount(7);
  await expect(page.locator('.week-day.has-reading')).toHaveCount(0);
  await expect(page.locator('.rhythm-heading')).toContainText('0 / 20 min today');
  await page.locator('[data-tab=library]').click();expect(await page.locator('.book-cover').first().getAttribute('src')).toBe(cover);
  expect(await page.locator('.book-title').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
});
test('system and app reduced motion prevent animation, even while navigating',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await seed(page,3);
  expect(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('[data-tab=home]').click();
  await page.evaluate(()=>document.documentElement.dataset.motion='reduced');
  await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
});
