import {test,expect} from '@playwright/test';
import {extraPalettes} from '../src/palettes';
const luminance=(hex:string)=>{const values=hex.match(/[a-f\d]{2}/gi)!.map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722};
const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
test('all 20 additional palettes keep body, secondary, accent and button text readable',async({page})=>{
 await page.goto('/');
 for(const [id,palette] of Object.entries(extraPalettes)){
  expect(contrast(palette.fg,palette.bg),`${id} reading ink`).toBeGreaterThanOrEqual(7);
  await page.evaluate(id=>document.documentElement.dataset.appTheme=id,id);
  const colors=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['app-text','app-secondary','app-accent','app-background','app-surface','button-face','button-ink'].map(k=>[k,s.getPropertyValue('--'+k).trim()]))});
  for(const ink of ['app-text','app-secondary','app-accent'])for(const paper of ['app-background','app-surface'])expect(contrast(colors[ink],colors[paper]),`${id} ${ink}/${paper}`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors['button-ink'],colors['button-face']),`${id} button`).toBeGreaterThanOrEqual(4.5);
 }
});
