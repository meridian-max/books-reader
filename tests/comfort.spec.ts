import {test,expect,type Page} from '@playwright/test';

async function addBooks(page:Page){
  await page.locator('#file-input').setInputFiles([
    {name:'Quiet mornings.txt',mimeType:'text/plain',buffer:Buffer.from('Mira opened her book beside the window. A new story filled the quiet room.\n\n'.repeat(180))},
    {name:'Evening stories.txt',mimeType:'text/plain',buffer:Buffer.from('The evening light fell across the pages. Each sentence brought another discovery.\n\n'.repeat(160))},
  ]);
  await expect(page.locator('.book-card')).toHaveCount(2);
}
async function settings(page:Page){await page.locator('[data-tab=profile]').click();await page.locator('[data-shortcut=settings]').first().click();await expect(page.locator('.settings-layout')).toBeVisible()}
async function noOverflow(page:Page){
  const size=await page.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth,page:document.querySelector('#page')!.scrollWidth,client:document.querySelector('#page')!.clientWidth}));
  expect(size.body).toBeLessThanOrEqual(size.viewport+1);expect(size.page).toBeLessThanOrEqual(size.client+1);
}
for(const width of [360,412,768])test(`comfort navigation, search and library layout fit ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:850});await page.goto('/');
  await expect(page.locator('.welcome-card')).toBeVisible();await noOverflow(page);
  for(const button of await page.locator('.bottom-nav button').all()) {const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(48);expect(box!.width).toBeGreaterThanOrEqual(48)}
  await addBooks(page);await noOverflow(page);
  await page.locator('#library-search').fill('Quiet mornings');await expect(page.locator('.book-card')).toHaveCount(1);
  await page.locator('[data-action=close-search]').click();await expect(page.locator('.book-card')).toHaveCount(2);
  await page.locator('[data-action=view-list]').click();await expect(page.locator('.books-list .book-card')).toHaveCount(2);await noOverflow(page);
  await page.locator('[data-action=view-grid]').click();
  await page.locator('[data-filter=reading]').click();await expect(page.locator('.book-card')).toHaveCount(0);
  await page.locator('[data-filter=all]').click();await expect(page.locator('.book-card')).toHaveCount(2);
  const covers=await page.locator('.book-cover').evaluateAll(async images=>Promise.all(images.map(async image=>{const img=image as HTMLImageElement;await img.decode();return img.naturalWidth})));expect(covers.every(width=>width>0)).toBe(true);
  await page.locator('[data-tab=notebook]').click();await expect(page.locator('.journal-empty')).toBeVisible();await noOverflow(page);
  await settings(page);await noOverflow(page);
  await page.locator('[data-action=mobile-menu]').click();await expect(page.locator('#page')).toHaveAttribute('inert','');
  await page.locator('.sidebar [data-nav=files]').click();await expect(page.locator('.bottom-nav')).toBeVisible();await noOverflow(page);
  await page.locator('[data-action=mobile-menu]').click();await page.keyboard.press('Escape');await expect(page.locator('.sidebar')).toHaveAttribute('inert','');
  await page.locator('[data-tab=home]').click();await expect(page.locator('.continue-card')).toBeVisible();await noOverflow(page);
});

test('settings search reveals the right group and saves a real boolean without changing books',async({page})=>{
  await page.setViewportSize({width:412,height:850});await page.goto('/');await addBooks(page);await settings(page);
  await expect(page.locator('.settings-panel[open]')).toHaveCount(0);
  await page.locator('#settings-search').fill('Automatically sync');
  await expect(page.locator('.settings-panel:visible')).toHaveCount(1);
  await page.locator('.toggle-field').filter({has:page.locator('[data-setting=autoSync]')}).click();
  await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('books-reader');r.onsuccess=()=>{const db=r.result,q=db.transaction('settings').objectStore('settings').get('reader');q.onsuccess=()=>{resolve(q.result.autoSync);db.close()}}}))).toBe(false);
  await page.reload();await settings(page);await page.locator('#settings-search').fill('Automatically sync');await expect(page.locator('[data-setting=autoSync]')).not.toBeChecked();
  await page.locator('#settings-search').fill('unfindablezz');await expect(page.locator('.settings-no-results')).toBeVisible();
  await page.locator('#settings-search').clear();await expect(page.locator('.settings-panel:visible')).toHaveCount(7);
  await page.locator('[data-tab=library]').click();await expect(page.locator('.book-card')).toHaveCount(2);
});

test('dark mode keeps resume text legible and survives restart',async({page})=>{
  await page.setViewportSize({width:360,height:800});await page.goto('/');await addBooks(page);await settings(page);
  await page.locator('.settings-panel > summary').first().click();await page.locator('[data-setting=appTheme]').selectOption('dark');
  await page.locator('[data-tab=home]').click();await expect(page.locator('html')).toHaveAttribute('data-app-theme','dark');
  const contrast=await page.locator('.continue-card').evaluate(el=>{
    const rgb=(value:string)=>value.match(/[\d.]+/g)!.slice(0,3).map(Number);
    const lum=(c:number[])=>c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,b,i)=>a+b*[.2126,.7152,.0722][i],0);
    const bg=lum(rgb(getComputedStyle(el).backgroundColor)),fg=lum(rgb(getComputedStyle(el.querySelector('h1')!).color));
    return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);
  });expect(contrast).toBeGreaterThanOrEqual(4.5);await noOverflow(page);
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-app-theme','dark');await expect(page.locator('.home-book')).toHaveCount(2);
});

test('five named reading tools keep advanced controls and focus recovery reachable',async({page})=>{
  await page.setViewportSize({width:360,height:800});await page.goto('/');await addBooks(page);
  await page.locator('.book-cover-button').first().click();await page.waitForFunction(()=>!!(document.querySelector('foliate-view') as any)?.renderer?.getContents().length);
  await expect(page.locator('.reader-tool')).toHaveText(['Style','Chapters','Notes','Listen','More']);
  await page.locator('.reader-tool[data-action=appearance]').click();
  await expect(page.locator('[data-setting=fontSize]')).toBeVisible();
  await page.locator('.page-colors > summary').click();await page.locator('[data-theme=sepia]').click();
  await page.locator('.advanced-settings').filter({has:page.locator('[data-setting=bionic]')}).locator(':scope > summary').click();await expect(page.locator('[data-setting=bionic]')).toBeVisible();
  await page.locator('.close-modal').click();await page.locator('.reader-tool[data-action=more]').click();
  await expect(page.locator('[data-reader-option]')).toHaveCount(16);await page.locator('[data-reader-option=fullscreen]').click();
  await expect(page.locator('#reader')).toHaveClass(/controls-hidden/);
  await expect(page.locator('.reader-reveal')).toBeVisible();await page.locator('.reader-reveal').click();await expect(page.locator('.reader-tool').first()).toBeVisible();
  await page.locator('[data-action=exit]').click();await expect(page.locator('.book-card')).toHaveCount(2);
});

test('closing a dialog returns keyboard focus to its trigger',async({page})=>{
  await page.goto('/');await page.locator('[data-tab=library]').click();
  const trigger=page.locator('[data-action=shelf-selector]');await trigger.click();
  await expect(page.locator('.modal')).toBeVisible();await expect(page.locator('.close-modal')).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(page.locator('[data-destination=notebook]')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('.close-modal')).toBeFocused();
  await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
});
