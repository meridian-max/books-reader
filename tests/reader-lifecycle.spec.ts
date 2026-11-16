import {test, expect, type Page} from "@playwright/test";

async function openBook(page: Page, animation = "slide") {
  await page.setViewportSize({width:412,height:850});
  await page.goto("/");
  const paragraphs=Array.from({length:240},(_,i)=>`<p>Paragraph ${i}. Mira read by the window, finding a new thought in each passage before continuing through the story.</p>`).join("");
  const html='<html><body><div id="nested" style="width:180px;height:70px;overflow-x:auto;white-space:nowrap"><span style="display:inline-block;width:900px">A wide table or code sample owns its horizontal scroll gesture.</span></div>'+paragraphs+'</body></html>';
  await page.locator("#file-input").setInputFiles({name:"Reading lifecycle.html",mimeType:"text/html",buffer:Buffer.from(html)});
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(()=>!!(document.querySelector("foliate-view") as any)?.renderer?.getContents()?.length);
  await page.locator("[data-action=appearance]").click();
  await page.locator("[data-setting=flow]").selectOption("scrolled");
  await page.locator("[data-setting=animation]").selectOption(animation);
  await page.locator(".close-modal").click();
  await page.waitForTimeout(400);
}

test("continuous auto-scroll reports progress before stopping",async({page})=>{
  await openBook(page);
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator("[data-reader-option=autoscroll]").click();
  await page.locator("[data-setting=autoMode]").selectOption("pixel");
  await page.locator("[data-setting=autoSpeed]").fill("150");
  await page.evaluate(()=>{const v=document.querySelector("foliate-view") as any;(window as any).__progress=[];v.renderer.addEventListener("relocate",(event:any)=>{if(event.detail.reason==="scroll")(window as any).__progress.push(v.lastLocation.cfi)})});
  await page.locator("#start-auto").click();
  await page.waitForTimeout(3300);
  const state=await page.evaluate(()=>({updates:(window as any).__progress,position:(document.querySelector("foliate-view") as any).renderer.start,percent:document.querySelector("#reader-percent")!.textContent,running:!!document.querySelector("[data-auto-stop]")}));
  expect(state.running).toBe(true);
  expect(state.position).toBeGreaterThan(350);
  expect(new Set(state.updates).size).toBeGreaterThanOrEqual(2);
  expect(Number.parseFloat(state.percent!)).toBeGreaterThan(0);
  await page.locator("[data-auto-stop]").click();
});

test("auto-scroll retains its scroll mode and focus ruler after reopening",async({page})=>{
  await openBook(page);
  await page.locator("[data-action=appearance]").click();
  await page.locator("[data-setting=flow]").selectOption("paginated");
  await page.locator(".close-modal").click();
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator("[data-reader-option=autoscroll]").click();
  await page.locator("[data-setting=autoMode]").selectOption("blind");
  await page.locator("#start-auto").click();
  await expect(page.locator("[data-auto-stop]")).toBeVisible();
  const settings=await page.evaluate(()=>new Promise<any>(resolve=>{const q=indexedDB.open("books-reader");q.onsuccess=()=>{const d=q.result,r=d.transaction("settings").objectStore("settings").get("reader");r.onsuccess=()=>{resolve(r.result);d.close()}}}));
  expect(settings.flow).toBe("scrolled");
  expect(settings.ruler).toBe("window");
  await page.locator("[data-action=exit]").click();
  await expect(page.locator("#reader")).toBeHidden();
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(()=>!!(document.querySelector("foliate-view") as any)?.renderer?.getContents()?.length);
  expect(await page.evaluate(()=>(document.querySelector("foliate-view") as any).renderer.scrolled)).toBe(true);
  await expect(page.locator("#reading-ruler")).toHaveAttribute("data-style","window");
});

test("closing immediately after a scroll saves the visible passage",async({page})=>{
  await openBook(page);
  const expected=await page.evaluate(async()=>{
    const {getVisibleRange}=await import(/* @vite-ignore */ "/foliate/paginator.js");
    const v=document.querySelector("foliate-view") as any,r=v.renderer;
    r.scrollBy(0,1400);
    await new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined)));
    const item=r.getContents()[0],margin=Number.parseFloat(r.getAttribute("margin"));
    const cfi=v.getCFI(item.index,getVisibleRange(item.doc,r.start+margin,r.end-margin,(rect:DOMRect)=>({left:rect.top+margin,right:rect.bottom+margin})));
    (document.querySelector("[data-action=exit]") as HTMLElement).click();
    return {cfi,position:r.start};
  });
  await expect(page.locator("#reader")).toBeHidden();
  const saved=await page.evaluate(()=>new Promise<any>((resolve,reject)=>{const q=indexedDB.open("books-reader");q.onsuccess=()=>{const d=q.result,r=d.transaction("books").objectStore("books").getAll();r.onsuccess=()=>{resolve(r.result[0].location);d.close()};r.onerror=()=>reject(r.error)}}));
  expect(saved).toBe(expected.cfi);
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(()=>!!(document.querySelector("foliate-view") as any)?.renderer?.getContents()?.length);
  // Restoring a CFI aligns its first line; the viewport can shift by a few
  // pixels. The stored CFI must be exact, and reopening stays on that line.
  expect(Math.abs(await page.evaluate(()=>(document.querySelector("foliate-view") as any).renderer.start)-expected.position)).toBeLessThan(40);
});

test("closing cancels pending scroll callbacks without errors or late relocations",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await openBook(page);
  await page.evaluate(async()=>{
    const v=document.querySelector("foliate-view") as any;
    (window as any).__lateRelocations=0;
    v.addEventListener("relocate",()=>{if(!document.body.classList.contains("reading"))(window as any).__lateRelocations++});
    v.renderer.scrollBy(0,1400);
    await new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined)));
    (document.querySelector("[data-action=exit]") as HTMLElement).click();
  });
  await expect(page.locator("#reader")).toBeHidden();
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
  expect(await page.evaluate(()=>(window as any).__lateRelocations)).toBe(0);
});

for(const animation of ["slide","fade"]) test(`nested horizontal scrolling keeps ownership with ${animation} page turns`,async({page})=>{
  await openBook(page,animation);
  await page.locator("[data-action=appearance]").click();
  await page.locator("[data-setting=flow]").selectOption("paginated");
  await page.locator(".close-modal").click();
  await page.waitForTimeout(400);
  const result=await page.evaluate(async()=>{
    const r=(document.querySelector("foliate-view") as any).renderer,doc=r.getContents()[0].doc;
    const target=doc.querySelector("#nested span"),start=r.start;
    const touch=(x:number)=>new Touch({identifier:1,target,screenX:x,screenY:180,clientX:x,clientY:180});
    target.dispatchEvent(new PointerEvent("pointerdown",{pointerType:"touch",clientX:300,clientY:180,bubbles:true}));
    target.dispatchEvent(new TouchEvent("touchstart",{changedTouches:[touch(300)],touches:[touch(300)],bubbles:true,cancelable:true}));
    const move=new TouchEvent("touchmove",{changedTouches:[touch(70)],touches:[touch(70)],bubbles:true,cancelable:true});
    target.dispatchEvent(move);
    target.dispatchEvent(new PointerEvent("pointerup",{pointerType:"touch",clientX:70,clientY:180,bubbles:true}));
    target.dispatchEvent(new TouchEvent("touchend",{changedTouches:[touch(70)],touches:[],bubbles:true,cancelable:true}));
    await new Promise(resolve=>setTimeout(resolve,600));
    return{prevented:move.defaultPrevented,start,end:r.start};
  });
  expect(result.prevented).toBe(false);
  expect(Math.abs(result.end-result.start)).toBeLessThan(2);
});

test("repeated cancelled page drags return to the starting page",async({page})=>{
  await openBook(page);
  await page.locator("[data-action=appearance]").click();
  await page.locator("[data-setting=flow]").selectOption("paginated");
  await page.locator(".close-modal").click();
  await page.waitForTimeout(400);
  const positions=await page.evaluate(async()=>{
    const r=(document.querySelector("foliate-view") as any).renderer,doc=r.getContents()[0].doc,target=doc.querySelector("p");
    const start=r.start,positions=[];
    for(let i=0;i<2;i++){
      const touch=(x:number)=>new Touch({identifier:i+1,target,screenX:x,screenY:180,clientX:x,clientY:180});
      target.dispatchEvent(new TouchEvent("touchstart",{changedTouches:[touch(300)],touches:[touch(300)],bubbles:true,cancelable:true}));
      target.dispatchEvent(new TouchEvent("touchmove",{changedTouches:[touch(70)],touches:[touch(70)],bubbles:true,cancelable:true}));
      target.dispatchEvent(new TouchEvent("touchcancel",{changedTouches:[touch(70)],touches:[],bubbles:true,cancelable:true}));
      await new Promise(resolve=>setTimeout(resolve,300));
      positions.push(r.start-start);
    }
    return positions;
  });
  expect(positions.every(x=>Math.abs(x)<2)).toBe(true);
});
