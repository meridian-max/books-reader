import {test, expect} from "@playwright/test";
import {zipSync, strToU8} from "fflate";

test("visible-range index preserves exact ranges across nested, reordered and changed layouts", async ({page}) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const {getVisibleRange} = await import(/* @vite-ignore */ "/foliate/paginator.js");
    const {VisibleRangeIndex} = await import(/* @vite-ignore */ "/foliate/visible-range.js");
    const frame = document.createElement("iframe"); frame.style.cssText="width:400px;height:600px";
    document.body.append(frame);
    const doc = frame.contentDocument!;
    doc.open(); doc.write('<html><head><style>body{margin:0;font:16px/24px serif}p{margin:12px 0}section{margin:0}</style></head><body><section>'+Array.from({length:200},(_,i)=>`<p>Paragraph ${i}: <b>one phrase</b> and another passage to keep in the book.</p>`).join("")+'</section></body></html>');doc.close();
    const index = new VisibleRangeIndex(doc);
    const mapper = (rect: DOMRect) => ({left:rect.top,right:rect.bottom});
    const checks: {stage:string;equal:boolean}[] = [];
    const compare = (stage: string) => {
      for(const start of [0,170,1000,2600,5700]) {
        const slow=getVisibleRange(doc,start,start+500,mapper);
        const fast=getVisibleRange(doc,start,start+500,mapper,index);
        checks.push({stage:stage+"@"+start,equal:slow.compareBoundaryPoints(Range.START_TO_START,fast)===0 && slow.compareBoundaryPoints(Range.END_TO_END,fast)===0});
      }
    };
    compare("nested text");
    doc.querySelectorAll("p")[5].textContent = "Changed content. ".repeat(180);compare("text expanded");
    doc.querySelectorAll("p")[15].remove();compare("child removed");
    const extra=doc.createElement("p");extra.textContent="Inserted at the beginning";doc.querySelector("section")!.prepend(extra);compare("child inserted");
    doc.querySelectorAll("p")[10].setAttribute("style","position:relative;top:-600px");compare("nonmonotonic bounds");
    frame.style.width="260px"; index.invalidate();compare("viewport changed");
    index.destroy();frame.remove();return checks;
  });
  expect(results.filter(x=>!x.equal)).toEqual([]);
});

for (const format of ["txt", "epub"] as const) test(`large ${format} scrolling avoids full-chapter remeasurement and retains position and highlights`, async ({page}) => {
  test.setTimeout(60000);
  await page.setViewportSize({width:412,height:850});
  await page.goto("/");
  const text=Array.from({length:16000},(_,i)=>`Paragraph ${i}. Mira opened her book and read by the window. Each page offered another story and a new thought. She paused to consider the words before continuing with the next paragraph.`).join("\n\n");
  const epub=zipSync({
    "mimetype": strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    "book.opf": strToU8('<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">large-scroll-fixture</dc:identifier><dc:title>Large reading test</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>'),
    "chapter.xhtml": strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Reading</title></head><body>'+text.split("\n\n").map(p=>"<p>"+p+"</p>").join("")+"</body></html>"),
  });
  await page.locator("#file-input").setInputFiles({name:"Large reading test."+format,mimeType:format === "txt" ? "text/plain" : "application/epub+zip",buffer:format === "txt" ? Buffer.from(text) : Buffer.from(epub)});
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(()=>!!(document.querySelector("foliate-view") as any)?.renderer?.getContents()?.length);
  await page.locator("[data-action=appearance]").click();
  await page.locator("[data-setting=flow]").selectOption("scrolled");
  await page.locator(".close-modal").click();
  await page.waitForTimeout(700);
  await page.evaluate(async()=>{const v=document.querySelector("foliate-view") as any;await v.goToFraction(0)});
  await page.waitForTimeout(400);
  const initial=await page.evaluate(()=>(document.querySelector("foliate-view") as any).lastLocation.cfi);
  await page.evaluate(()=>(document.querySelector("foliate-view") as any).renderer.scrollBy(0,800));
  await expect.poll(()=>page.evaluate(()=>(document.querySelector("foliate-view") as any).lastLocation.cfi)).not.toBe(initial);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
  const report=await page.evaluate(async()=>{
    const {getVisibleRange}=await import(/* @vite-ignore */ "/foliate/paginator.js");
    const v=document.querySelector("foliate-view") as any,r=v.renderer,doc=r.getContents()[0].doc;
    let reads=0;const proto=doc.defaultView.Element.prototype,original=proto.getBoundingClientRect;
    proto.getBoundingClientRect=function(...args:any[]){reads++;return original.apply(this,args)};
    const tasks:number[]=[];
    const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:"longtask"});
    const points=[];
    try {
      for(const fraction of [.1,.4,.7,.95]) {
        r.scrollBy(0,r.viewSize*fraction-r.start);
        await new Promise(resolve=>setTimeout(resolve,650));
        points.push({fraction,cfi:v.lastLocation.cfi,text:v.lastLocation.range.toString(),start:r.start,end:r.end});
      }
      observer.disconnect();
      const readsDuringScroll=reads;
      const margin=Number.parseFloat(r.getAttribute("margin"));
      const references=points.map(point=>v.getCFI(r.getContents()[0].index,getVisibleRange(doc,point.start+margin,point.end-margin,(rect:DOMRect)=>({left:rect.top+margin,right:rect.bottom+margin}))));
      return {reads:readsDuringScroll,tasks,points,references};
    }finally{proto.getBoundingClientRect=original;observer.disconnect()}
  });
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:1});
  expect(report.reads).toBeLessThan(500);
  expect(report.tasks).toEqual([]);
  expect(report.points.map(x=>x.cfi)).toEqual(report.references);
  // Save a real selection deep in the document; the index cannot alter CFI addressing.
  const passage=await page.evaluate(()=>{
    const view=document.querySelector("foliate-view") as any,doc=view.renderer.getContents()[0].doc;
    const p=doc.querySelectorAll("p")[15201],range=doc.createRange();range.selectNodeContents(p);
    const sel=doc.getSelection();sel.removeAllRanges();sel.addRange(range);doc.dispatchEvent(new Event("selectionchange"));return p.textContent;
  });
  await page.locator('[data-selection="highlight"]').click();
  await expect(page.locator("#toast")).toContainText("highlighted");
  await page.locator("[data-action=exit]").click();
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(()=>!!(document.querySelector("foliate-view") as any)?.renderer?.getContents()?.length);
  await expect.poll(()=>page.evaluate(()=>(document.querySelector("foliate-view") as any).lastLocation?.range?.toString())).toContain("Paragraph 15201");
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator("[data-reader-option=notes]").click();
  await expect(page.locator(".mark-quote")).toContainText(passage);
});
