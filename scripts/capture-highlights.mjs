import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({executablePath: '/home/divyansh/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const page = await browser.newPage({viewport:{width:412,height:892}});
const dir = 'docs/screenshots/highlights-1.5.1';
await mkdir(dir,{recursive:true});
const shot = async name => {
 await page.waitForFunction(()=>!document.querySelector('#toast')?.classList.contains('visible'));
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`${dir}/${name}.png`,animations:'disabled'});
};
try {
 await page.goto('http://127.0.0.1:5173');
 await page.locator('[data-action=sample-books]').click();
 await page.locator('.book-card').nth(3).waitFor();
 await page.locator('.book-card').filter({hasText:'Alice'}).locator('.book-cover-button').click();
 await page.waitForFunction(()=>!!document.querySelector('foliate-view')?.renderer?.getContents().length);
 await page.evaluate(async()=>{await document.querySelector('foliate-view').goTo(2)});
 await page.waitForFunction(()=>document.querySelector('foliate-view').renderer.getContents()[0].doc.fonts.status==='loaded');
 const select = () => page.evaluate(()=>{
  const view=document.querySelector('foliate-view'),d=view.renderer.getContents()[0].doc;
  const p=[...d.querySelectorAll('p')].find(p=>p.textContent.length>70),w=d.createTreeWalker(p,NodeFilter.SHOW_TEXT);w.nextNode();
  const r=d.createRange();r.setStart(w.currentNode,0);r.setEnd(w.currentNode,Math.min(95,w.currentNode.textContent.length));
  const s=d.getSelection();s.removeAllRanges();s.addRange(r);d.dispatchEvent(new Event('selectionchange'));
 });
 await shot('before');await select();
 await page.locator('[data-selection=palette]').click();await shot('palette-paper');
 await page.locator('[data-selection=highlight]').click();
 await page.locator('#selection-tools').waitFor({state:'hidden'});
 await shot('marker-paper');
 await page.locator('[data-action=appearance]').click();
 await page.locator('.page-colors summary').click();
 await page.locator('[data-theme=night]').click();
 await page.locator('.close-modal').click();await shot('marker-night');
 await select();await page.locator('[data-selection=palette]').click();await shot('palette-night');
 await page.locator('[data-selection-style=Underline]').click();await shot('underline-preview');
 await page.locator('[data-selection=close]').click();
 await page.locator('[data-action=appearance]').click();await page.locator('.page-colors summary').click();await page.locator('[data-theme=paper]').click();await page.locator('.close-modal').click();
 await page.setViewportSize({width:320,height:700});await select();await page.locator('[data-selection=palette]').click();await shot('palette-320');
 const report=await page.evaluate(()=>({palette:document.querySelector('#selection-tools').getBoundingClientRect().toJSON(),controls:[...document.querySelectorAll('#selection-tools button:not([hidden]),#selection-tools .custom-highlight')].map(x=>({label:x.getAttribute('aria-label')||x.textContent,box:x.getBoundingClientRect().toJSON()}))}));
 await writeFile('docs/verification-1.5.1/controls-320.json',JSON.stringify(report,null,2));
 console.log('Captured highlight treatment and palette at 412px and 320px, on light and dark paper.');
} finally { await browser.close(); }
