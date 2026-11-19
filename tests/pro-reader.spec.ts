import { test, expect, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
import fs from "node:fs/promises";
import * as mupdf from "mupdf";

async function importText(page: Page) {
  await page.goto("/");
  await page.locator("#file-input").setInputFiles("tests/fixtures/story.txt");
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(() => !!(document.querySelector("foliate-view") as any)?.renderer?.getContents()?.length);
}
async function selectPassage(page: Page) {
  return page.evaluate(() => {
    const doc = (document.querySelector("foliate-view") as any).renderer.getContents()[0].doc;
    const p = [...doc.querySelectorAll("p")].find((p: any) => p.textContent.trim().length > 40);
    const range = doc.createRange(); range.selectNodeContents(p);
    const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    doc.dispatchEvent(new Event("selectionchange"));
    return p.textContent;
  });
}
async function marks(page: Page) {
  return page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("books-reader"); r.onsuccess = () => resolve(r.result); });
    const rows = await new Promise<any[]>(resolve => { const r = d.transaction("marks").objectStore("marks").getAll(); r.onsuccess = () => resolve(r.result); });
    d.close(); return rows.filter(x => !x.deleted);
  });
}
async function notebook(page: Page) {
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator("[data-reader-option=notes]").click();
}

test("compact selection supports cancel, multiline notes, filtering, and nonduplicating edits", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 850 });
  await importText(page);
  await selectPassage(page);
  await expect(page.locator("#selection-tools")).toBeVisible();
  expect((await page.locator("#selection-tools").boundingBox())!.height).toBeLessThan(60);
  await expect(page.locator(".selection-palette")).toBeHidden();
  await page.locator('[data-selection="note"]').click();
  await page.locator("#input-dialog textarea").fill("discarded");
  await page.locator("#annotation-cancel").click();
  expect(await marks(page)).toHaveLength(0);
  await page.locator('[data-selection="note"]').click();
  await page.locator("#input-dialog textarea").fill("First line\nSecond line");
  await page.locator('#input-dialog [name=style]').selectOption("Underline");
  await page.locator('#input-dialog [name=color]').fill("#4477aa");
  await page.locator("#input-dialog button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("Note saved");
  const original = (await marks(page))[0];
  expect(original.note).toBe("First line\nSecond line");
  expect(original.style).toBe("Underline");
  await notebook(page);
  await page.locator('[data-mark-filter="bookmark"]').click();
  await expect(page.locator(".mark-card")).toHaveCount(0);
  await page.locator('[data-mark-filter="note"]').click();
  await expect(page.locator(".mark-card")).toHaveCount(1);
  await page.locator("#marks-search").fill("missing passage");
  await expect(page.locator(".mark-card")).toHaveCount(0);
  await page.locator("#marks-search").fill("Second line");
  await page.locator("[data-mark-edit]").click();
  await page.locator("#input-dialog textarea").fill("Edited\nStill multiline");
  await page.locator('#input-dialog [name=style]').selectOption("Squiggly");
  await page.locator("#input-dialog button[type=submit]").click();
  await expect.poll(async () => (await marks(page))[0].note).toBe("Edited\nStill multiline");
  const updated = await marks(page);
  expect(updated).toHaveLength(1); expect(updated[0].id).toBe(original.id);
  expect(updated[0].style).toBe("Squiggly");
  await page.screenshot({ path: "docs/screenshots/books-1.1.0-reader.png" });
});

for(const flow of ['scrolled','paginated']) test(`jump back restores the reading position before a progress-slider jump in ${flow} mode`, async ({ page }) => {
  await importText(page);
  await page.locator('[data-action=appearance]').click();
  await page.locator('[data-setting=flow]').selectOption(flow);
  await page.locator('.close-modal').click();
  const location = () => page.evaluate(() => (document.querySelector("foliate-view") as any).lastLocation.cfi);
  await expect.poll(location).toBeTruthy();
  const before = await location();
  const offset = await page.evaluate(()=>(document.querySelector('foliate-view') as any).renderer.start);
  await page.locator("#reading-progress").fill("0.7");
  await expect.poll(location).not.toBe(before);
  await expect(page.locator('[data-action="jump-back"]')).toBeEnabled();
  await page.locator('[data-action="jump-back"]').click();
  await expect.poll(location).toBe(before);
  expect(Math.abs(await page.evaluate(()=>(document.querySelector('foliate-view') as any).renderer.start)-offset)).toBeLessThan(1.1);
  await expect(page.locator('[data-action="jump-back"]')).toBeDisabled();
});

test("EPUB3 series metadata survives import and author, series and rating groups navigate", async ({ page }) => {
  await page.goto("/");
  const xml = (s: string) => strToU8(s);
  const epub = zipSync({
    mimetype: xml("application/epub+zip"),
    "META-INF/container.xml": xml('<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    "book.opf": xml('<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">series-test</dc:identifier><dc:title>Second Book</dc:title><dc:creator>Ada Writer</dc:creator><dc:language>en</dc:language><meta property="belongs-to-collection" id="series">A Reading Series</meta><meta refines="#series" property="collection-type">series</meta><meta refines="#series" property="group-position">2</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>'),
    "chapter.xhtml": xml('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><p>A chapter in the second book of a reading series.</p></body></html>'),
  });
  await page.locator("#file-input").setInputFiles({ name: "series.epub", mimeType: "application/epub+zip", buffer: Buffer.from(epub) });
  await expect(page.locator(".book-card")).toHaveCount(1);
  const group = async (name: string) => {
    await page.locator("[data-action=shelf-selector]").click();
    await page.locator('[data-destination="'+name+'"]').click();
  };
  await group("authors");
  await page.locator('[data-author="Ada Writer"]').click();
  await expect(page.locator(".book-title")).toContainText("Second Book");
  await group("series");
  await page.locator('[data-series="A Reading Series"]').click();
  await expect(page.locator(".book-title")).toContainText("Second Book");
  await page.locator("[data-book-menu]").click();
  await page.locator(".portrait-manage summary").click();
  await page.locator('[data-book-action="edit"]').click();
  await expect(page.locator('#edit-book [name="series"]')).toHaveValue("A Reading Series");
  await expect(page.locator('#edit-book [name="seriesIndex"]')).toHaveValue("2");
  await page.locator(".close-modal").click();
  await group("ratings");
  await page.locator('[data-rating-group="0"]').click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.reload();
  await page.locator('[data-action="mobile-menu"]').click();
  await page.locator('.sidebar [data-nav="library"]').click();
  await group("series");
  await expect(page.locator('[data-series="A Reading Series"]')).toBeVisible();
});

test("free release keeps notebook export and cloud settings without Readwise", async ({ page }) => {
  await importText(page);
  const text = await selectPassage(page);
  await page.locator('[data-selection="note"]').click();
  await page.locator("#input-dialog textarea").fill("A local note\nwith two lines");
  await page.locator("#input-dialog button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("Note saved");
  await notebook(page);
  await expect(page.getByRole("button", {name:"Readwise", exact:true})).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.locator("#export-marks").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Books-notebook.md");
  const exported = await fs.readFile((await file.path())!, "utf8");
  expect(exported).toContain(text.trim());
  expect(exported).toContain("A local note\nwith two lines");
  expect(await marks(page)).toHaveLength(1);
  await page.locator(".close-modal").click();
  await page.locator(".reader-top-actions [data-action=more]").click();
  await expect(page.locator('[data-reader-option="readwise"]')).toHaveCount(0);
  await page.locator(".close-modal").click();
  await page.locator('[data-action="exit"]').click();
  await page.locator('[data-tab="profile"]').click();
  await page.locator('[data-shortcut="settings"]').first().click();
  await expect(page.locator("summary").filter({hasText:"Readwise"})).toHaveCount(0);
  await page.locator("summary").filter({hasText:"Cloud synchronization"}).click();
  await page.locator('[data-action="connect-cloud"]').click();
  await expect(page.locator('select[name="provider"] option')).toHaveText(["WebDAV / Nextcloud", "Dropbox access token"]);
});

test("PDF highlight style and note edits keep one embedded annotation with original geometry", async ({ page }) => {
  await page.goto("/");
  await page.locator("#file-input").setInputFiles("tests/fixtures/reading.pdf");
  await page.locator(".book-cover-button").click();
  await expect(page.locator(".pdf-text-layer")).toContainText("A quiet beginning");
  await page.evaluate(() => {
    const layer = document.querySelector(".pdf-text-layer")!;
    const node = [...layer.querySelectorAll("span")].find(s => s.textContent?.includes("A quiet beginning"))!;
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    layer.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await expect(page.locator("#selection-tools")).toBeVisible();
  await page.locator('[data-selection="highlight"]').click();
  await expect.poll(async () => (await marks(page)).length).toBe(1);
  const original = (await marks(page))[0];
  expect(original.quads.length).toBeGreaterThan(0);
  await notebook(page);
  await page.locator("[data-mark-edit]").click();
  await page.locator("#input-dialog textarea").fill("Changed PDF note\nSecond line");
  await page.locator('#input-dialog [name="style"]').selectOption("StrikeOut");
  await page.locator('#input-dialog [name="color"]').fill("#4477aa");
  await page.locator("#input-dialog button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("Note saved");
  expect(await marks(page)).toHaveLength(1);
  expect((await marks(page))[0].id).toBe(original.id);
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator('[data-reader-option="miscellaneous"]').click();
  await page.locator("#pdf-annotations").click();
  await page.locator("[data-pdf-edit]").click();
  await expect(page.locator("#input-dialog textarea")).toHaveValue("Changed PDF note\nSecond line");
  await page.locator("#input-dialog textarea").fill("Changed PDF note\nSecond line");
  await page.locator("#input-dialog button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("Note saved");
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator('[data-reader-option="miscellaneous"]').click();
  const download = page.waitForEvent("download");
  await page.locator("#pdf-export").click();
  const file = await download;
  const doc = mupdf.Document.openDocument(new Uint8Array(await fs.readFile((await file.path())!)), "application/pdf") as mupdf.PDFDocument;
  const first = doc.loadPage(0), annotations = first.getAnnotations();
  const annotation = annotations.find(a => a.getObject().get("NM").asString() === original.id)!;
  expect(annotations.filter(a => a.getObject().get("NM").asString() === original.id)).toHaveLength(1);
  expect(annotation.getType()).toBe("StrikeOut");
  expect(annotation.getContents()).toBe("Changed PDF note\nSecond line");
  const quads = annotation.getQuadPoints();
  expect(quads).toHaveLength(original.quads.length);
  quads.forEach((quad, index) => quad.forEach((value, coordinate) => expect(value).toBeCloseTo(original.quads[index][coordinate], 3)));
  expect(annotation.getColor()[0]).toBeCloseTo(0x44 / 255, 3);
  annotations.forEach(a => a.destroy()); first.destroy(); doc.destroy();
  await page.locator(".close-modal").click();
  await page.locator('.reader-tool[data-action=contents]').click();
  await page.locator('[data-reader-tab=bookmarks]').click();
  await expect(page.locator('.navigator-mark-note')).toContainText('Changed PDF note');
  await page.locator('[data-mark-remove]').click();
  await expect(page.locator('.navigator-mark')).toHaveCount(0);
  expect(await marks(page)).toHaveLength(0);
  await page.locator('.close-modal').click();
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator('[data-reader-option="miscellaneous"]').click();
  const deletedDownload = page.waitForEvent('download');
  await page.locator('#pdf-export').click();
  const deletedFile = await deletedDownload;
  const deletedDoc = mupdf.Document.openDocument(new Uint8Array(await fs.readFile((await deletedFile.path())!)), 'application/pdf') as mupdf.PDFDocument;
  const deletedPage=deletedDoc.loadPage(0), remaining=deletedPage.getAnnotations();
  expect(remaining.some(a=>a.getObject().get('NM').asString()===original.id)).toBe(false);
  remaining.forEach(a=>a.destroy());deletedPage.destroy();deletedDoc.destroy();
});

test("PDF worker can edit and delete legacy Books annotation IDs", async ({ page }) => {
  const pdf = mupdf.Document.openDocument(new Uint8Array(await fs.readFile("tests/fixtures/reading.pdf")), "application/pdf") as mupdf.PDFDocument;
  const first = pdf.loadPage(0), old = first.createAnnotation("Highlight");
  old.setQuadPoints([[45, 30, 200, 30, 45, 60, 200, 60]]);
  old.setContents("Old Books highlight");
  old.getObject().put("NM", "legacy_books_id"); // 1.0.2 wrote a PDF name instead of a text string.
  old.update(); old.destroy(); first.destroy();
  const buffer = pdf.saveToBuffer(), bytes = Array.from(buffer.asUint8Array());
  buffer.destroy(); pdf.destroy();
  await page.goto("/");
  const result = await page.evaluate(async bytes => {
    const worker = new Worker("/pdf-worker.js", { type: "module" });
    let id = 0;
    const waiting = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void}>();
    const ready = new Promise<void>((resolve, reject) => {
      worker.onerror = event => reject(Error(event.message));
      worker.onmessage = ({data}) => {
        if (data.ready) { resolve(); return; }
        const pending = waiting.get(data.id)!; waiting.delete(data.id);
        if (data.ok) pending.resolve(data.data); else pending.reject(Error(data.error));
      };
    });
    const rpc = (method: string, args: any = {}) => new Promise<any>((resolve, reject) => {
      const key = ++id; waiting.set(key, {resolve, reject}); worker.postMessage({id:key, method, args});
    });
    try {
      await ready;
      await rpc("open", {buffer:new Uint8Array(bytes)});
      await rpc("editAnnotation", {page:0, id:"legacy_books_id", text:"Edited legacy highlight", type:"Underline", color:[.2,.4,.6]});
      const edited = await rpc("annotations");
      await rpc("deleteAnnotation", {page:0, id:"legacy_books_id"});
      const deleted = await rpc("annotations");
      await rpc("close");
      return {edited, deleted};
    } finally { worker.terminate(); }
  }, bytes);
  expect(result.edited).toHaveLength(1);
  expect(result.edited[0]).toMatchObject({type:"Underline", text:"Edited legacy highlight"});
  expect(result.deleted).toHaveLength(0);
});
