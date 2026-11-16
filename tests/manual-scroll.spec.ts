import {test, expect, type Page} from '@playwright/test';
import {manualScrollBook} from '../scripts/manual-scroll-fixture.mjs';


async function openBook(page: Page, flow:string|null='scrolled', animation='slide', format='epub') {
  await page.setViewportSize({width:412,height:850});
  await page.goto('/');
  await page.locator('#file-input').setInputFiles({name:'Manual scrolling.'+format,mimeType:format==='txt'?'text/plain':'application/epub+zip',buffer:format==='txt'?Buffer.from('Mira read by the window. The story continued with another thought and a new adventure.\n\n'.repeat(150)):Buffer.from(manualScrollBook())});
  await page.locator('.book-cover-button').click();
  await page.waitForFunction(()=>!!(document.querySelector('foliate-view') as any)?.renderer?.getContents().length);
  if (flow) {
    await page.locator('[data-action=appearance]').click();
    await page.locator('[data-setting=flow]').selectOption(flow);
    await page.locator('[data-setting=animation]').selectOption(animation);
    await page.locator('.close-modal').click();
  }
  await page.evaluate(()=>(document.querySelector('foliate-view') as any).goTo(0));
  await page.waitForTimeout(500);
}

async function swipe(page:Page, dx:number, dy:number, x?:number, y?:number) {
  const box=await page.locator('foliate-view').boundingBox();
  x??=box!.x+box!.width/2-dx/2;
  y??=box!.y+box!.height/2-dy/2;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=12;i++) {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/12,y:y+dy*i/12}]});
    await page.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.detach();
  await page.waitForTimeout(600);
}
const state=(page:Page)=>page.evaluate(()=>{const v=document.querySelector('foliate-view') as any,r=v.renderer;return{start:r.start,end:r.end,extent:r.viewSize,size:r.size,index:r.getContents()[0].index,cfi:v.lastLocation.cfi}});

for (const format of ['epub','txt']) test(`up/down swipes work on first opening ${format} without changing settings`,async({page})=>{
  await openBook(page,null,'slide',format);
  const before=await state(page);
  await swipe(page,0,-220);
  const forward=await state(page);
  expect(forward.start-before.start).toBeGreaterThan(150);
  await swipe(page,0,180);
  expect((await state(page)).start).toBeLessThan(forward.start-100);
  await expect(page.locator('[data-action=toggle-flow]')).toHaveText('Scroll');
});

test('updating legacy page mode enables scrolling once and preserves later mode choices',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('books-reader');request.onsuccess=()=>{const db=request.result,tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({flow:'paginated',fontSize:23,theme:'sepia',eventActions:{tapCenter:'toolbar'}},'reader');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}}));
  await openBook(page,null);
  await expect(page.locator('[data-action=toggle-flow]')).toHaveText('Scroll');
  expect(await page.evaluate(()=>{const doc=(document.querySelector('foliate-view') as any).renderer.getContents()[0].doc;return doc.defaultView.getComputedStyle(doc.body).fontSize})).toBe('23px');
  await swipe(page,0,-220);
  expect((await state(page)).start).toBeGreaterThan(150);
  await page.locator('[data-action=toggle-flow]').click();
  await expect(page.locator('[data-action=toggle-flow]')).toHaveText('Pages');
  await page.locator('[data-action=exit]').click();
  await page.reload();
  await page.locator('[data-action=mobile-menu]').click();
  await page.locator('[data-nav=library]').click();
  await page.locator('.book-cover-button').click();
  await page.waitForFunction(()=>!!(document.querySelector('foliate-view') as any)?.renderer?.getContents().length);
  await expect(page.locator('[data-action=toggle-flow]')).toHaveText('Pages');
  const settings=await page.evaluate(()=>new Promise<any>(resolve=>{const request=indexedDB.open('books-reader');request.onsuccess=()=>{const db=request.result,q=db.transaction('settings').objectStore('settings').get('reader');q.onsuccess=()=>{resolve(q.result);db.close()}}}));
  expect(settings).toMatchObject({flow:'paginated',readingModeVersion:1,fontSize:23,theme:'sepia'});
  await page.locator('[data-action=toggle-flow]').click();
  const before=await state(page);
  await swipe(page,0,-180);
  expect((await state(page)).start-before.start).toBeGreaterThan(100);
});

for (const format of ['epub','txt']) test(`finger scrolling moves both ways in ${format}`,async({page})=>{
  await openBook(page,'scrolled','slide',format);
  const before=await state(page);
  await swipe(page,0,-220);
  const forward=await state(page);
  expect(forward.start-before.start).toBeGreaterThan(150);
  expect(forward.index).toBe(0);
  await swipe(page,0,180);
  expect((await state(page)).start).toBeLessThan(forward.start-100);
});

test('outward swipes cross chapter edges and skip non-linear sections',async({page})=>{
  await openBook(page);
  await page.evaluate(()=>{const r=(document.querySelector('foliate-view') as any).renderer;r.scrollBy(0,r.viewSize)});
  await page.waitForTimeout(350);
  await swipe(page,0,-220);
  expect((await state(page)).index).toBe(2);
  // Short sections have both boundaries in the viewport.
  await swipe(page,0,-220);
  expect((await state(page)).index).toBe(3);
  await swipe(page,0,220);
  expect((await state(page)).index).toBe(2);
  await swipe(page,0,220);
  const back=await state(page);
  expect(back.index).toBe(0);
  await expect.poll(async()=>{const end=await state(page);return end.extent-end.end},{timeout:3000}).toBeLessThan(2);
  await swipe(page,0,-220);
  expect((await state(page)).index).toBe(2);
});

test('nested scrolling at a chapter edge does not turn the chapter',async({page})=>{
  await openBook(page);
  await page.evaluate(()=>{const r=(document.querySelector('foliate-view') as any).renderer;r.scrollBy(0,r.viewSize)});
  await page.waitForTimeout(350);
  const point=await page.evaluate(()=>{const r=(document.querySelector('foliate-view') as any).renderer,doc=r.getContents()[0].doc,b=doc.querySelector('#nested').getBoundingClientRect(),f=doc.defaultView.frameElement.getBoundingClientRect();return{x:b.left+f.left+b.width/2,y:b.bottom+f.top-10}});
  await swipe(page,0,-75,point.x,point.y);
  expect((await state(page)).index).toBe(0);
  expect(await page.evaluate(()=>(document.querySelector('foliate-view') as any).renderer.getContents()[0].doc.querySelector('#nested').scrollTop)).toBeGreaterThan(25);
});

for(const animation of ['slide','fade','none','curl','flip','eink']) test(`finger page turns work with ${animation}`,async({page})=>{
  await openBook(page,'paginated',animation);
  const before=await state(page);
  await swipe(page,-230,0);
  const next=await state(page);
  expect(Math.abs(next.start-before.start-before.size)).toBeLessThan(2);
  await swipe(page,230,0);
  expect(Math.abs((await state(page)).start-before.start)).toBeLessThan(2);
});

test('cancelled drags, selections and pinch gestures cannot turn a chapter',async({page})=>{
  await openBook(page);
  const results=await page.evaluate(async()=>{
    const r=(document.querySelector('foliate-view') as any).renderer,doc=r.getContents()[0].doc,target=doc.querySelector('p');
    r.scrollBy(0,r.viewSize);
    await new Promise(resolve=>setTimeout(resolve,350));
    const results=[];
    for(const kind of ['cancel','selection','pinch']) {
      const touch=(y:number,id=1)=>new Touch({identifier:id,target,screenX:160,screenY:y,clientX:160,clientY:y});
      if(kind==='selection'){const range=doc.createRange();range.selectNodeContents(target);doc.getSelection().addRange(range)}
      target.dispatchEvent(new TouchEvent('touchstart',{touches:[touch(500)],changedTouches:[touch(500)],bubbles:true}));
      target.dispatchEvent(new TouchEvent('touchmove',{touches:kind==='pinch'?[touch(200),touch(220,2)]:[touch(200)],changedTouches:[touch(200)],bubbles:true,cancelable:true}));
      target.dispatchEvent(new TouchEvent(kind==='cancel'?'touchcancel':'touchend',{touches:[],changedTouches:[touch(200)],bubbles:true}));
      await new Promise(resolve=>setTimeout(resolve,200));
      results.push({kind,index:r.getContents()[0].index});doc.getSelection().removeAllRanges();
    }
    return results;
  });
  expect(results.map(x=>x.index)).toEqual([0,0,0]);
});

test('swipes at the first and last book boundaries leave the reader usable',async({page})=>{
  await openBook(page);
  await swipe(page,0,180);
  expect((await state(page)).index).toBe(0);
  await page.evaluate(async()=>{const v=document.querySelector('foliate-view') as any;await v.goTo(3);v.renderer.scrollBy(0,v.renderer.viewSize)});
  await page.waitForTimeout(400);
  await swipe(page,0,-180);
  expect((await state(page)).index).toBe(3);
  const end=(await state(page)).start;
  await swipe(page,0,180);
  expect((await state(page)).start).toBeLessThan(end-100);
});

test('a slow manual scroll cannot trigger a configured long-press action',async({page})=>{
  await openBook(page);
  await page.locator('.reader-top-actions [data-action=more]').click();
  await page.locator('[data-reader-option=controls]').click();
  await page.locator('[data-control=longPress]').selectOption('appearance');
  await page.locator('.close-modal').click();
  await page.evaluate(async()=>{
    const doc=(document.querySelector('foliate-view') as any).renderer.getContents()[0].doc,target=doc.querySelector('p');
    const touch=(y:number)=>new Touch({identifier:1,target,screenX:160,screenY:y,clientX:160,clientY:y});
    target.dispatchEvent(new TouchEvent('touchstart',{touches:[touch(500)],changedTouches:[touch(500)],bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,750));
    target.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[touch(200)],bubbles:true}));
  });
  await expect(page.locator('.modal')).toHaveCount(0);
});
