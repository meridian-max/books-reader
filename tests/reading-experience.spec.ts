import { test, expect, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
import { readFile } from "node:fs/promises";
const xml = strToU8;
const picture =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300"><rect width="240" height="300" fill="#517b6c"/><circle cx="120" cy="140" r="68" fill="#edd6a8"/></svg>';
const epub = Buffer.from(
  zipSync({
    mimetype: xml("application/epub+zip"),
    "META-INF/container.xml": xml(
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    "book.opf": xml(
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">gallery-test</dc:identifier><dc:title>The illustrated garden</dc:title><dc:creator>Ada Reader</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="image" href="images/garden.svg" media-type="image/svg+xml"/>${Array.from({ length: 9 }, (_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine>${Array.from({ length: 9 }, (_, i) => `<itemref idref="c${i}"/>`).join("")}</spine></package>`,
    ),
    "nav.xhtml": xml(
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${Array.from({ length: 9 }, (_, i) => `<li><a href="c${i}.xhtml">Chapter ${i + 1}: The garden</a></li>`).join("")}</ol></nav></body></html>`,
    ),
    "images/garden.svg": xml(picture),
    ...Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [
        `c${i}.xhtml`,
        xml(
          `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Garden ${i + 1}</title><style>p{font-family:monospace}</style></head><body><h1>Chapter ${i + 1}</h1><p>A quiet <em>garden</em> opens a <strong>new world</strong> with every page. The morning brings another story.</p>${i === 0 || i === 8 ? '<img src="images/garden.svg" alt="The green garden"/>' : ""}${"<p>We returned to the path beside the trees. There was always something new to discover.</p>".repeat(25)}</body></html>`,
        ),
      ]),
    ),
  }),
);
async function importBook(page: Page) {
  await page.goto("/");
  await page.locator("#file-input").setInputFiles({
    name: "Garden.epub",
    mimeType: "application/epub+zip",
    buffer: epub,
  });
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(
    () =>
      !!(document.querySelector("foliate-view") as any)?.renderer?.getContents()
        .length,
  );
}
const settings = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const r = indexedDB.open("books-reader");
        r.onsuccess = () => {
          const db = r.result,
            q = db
              .transaction("settings")
              .objectStore("settings")
              .get("reader");
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
        };
      }),
  );
const chapter = (page: Page) =>
  page.evaluate(
    () =>
      (document.querySelector("foliate-view") as any).renderer.getContents()[0]
        .index,
  );
const selectPassage = async (page: Page) => {
  await page.waitForFunction(() => {
    const v = document.querySelector("foliate-view") as any, d = v?.renderer?.getContents()[0]?.doc;
    return v?.lastLocation?.range && d?.fonts.status === "loaded" && [...d.images].every((i: HTMLImageElement) => i.complete);
  });
  await page.evaluate(() => {
    const doc = (
      document.querySelector("foliate-view") as any
    ).renderer.getContents()[0].doc;
    const p = doc.querySelector("p"),
      r = doc.createRange();
    r.selectNodeContents(p);
    const selection = doc.getSelection();
    selection.removeAllRanges();
    selection.addRange(r);
    doc.dispatchEvent(new Event("selectionchange"));
  });
};

test("sidebar searches chapters, keeps bookmarks and saves actual embedded image bytes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await importBook(page);
  await page.locator(".reader-tool[data-action=contents]").click();
  await expect(page.locator(".reader-sidebar")).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Find a chapter" })
    .fill("Chapter 8");
  await expect(page.locator(".toc-item:visible")).toHaveCount(1);
  await page.locator(".toc-item:visible").click();
  await expect.poll(() => chapter(page)).toBe(7);
  await page.locator(".reader-tool[data-action=contents]").click();
  await page.locator("[data-reader-tab=bookmarks]").click();
  await page.locator("#navigator-add-bookmark").click();
  await expect(page.locator(".navigator-mark")).toHaveCount(1);
  await page.locator(".close-modal").click();
  await page.locator(".reader-tool[data-action=contents]").click();
  await page.locator("[data-reader-tab=images]").click();
  await expect(page.locator("[data-image]")).toHaveCount(1);
  await expect(page.locator("#gallery-more")).toBeEnabled();
  await page.locator("#gallery-more").click();
  await expect(page.locator("#gallery-more")).toBeHidden();
  await expect(page.locator("[data-image]")).toHaveCount(1);
  const imageUrl = await page.locator("[data-image] img").getAttribute("src");
  await page.locator("[data-image]").click();
  await expect(page.locator(".gallery-preview")).toBeVisible();
  await page.locator('[data-gallery-back]').focus();await page.keyboard.press('Shift+Tab');await expect(page.locator('[data-image-open]')).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('[data-gallery-back]')).toBeFocused();
  expect(
    await page
      .locator(".gallery-preview img")
      .evaluate(async (el: HTMLImageElement) => {
        await el.decode();
        return el.naturalWidth;
      }),
  ).toBe(240);
  const saved = page.waitForEvent("download");
  await page.locator("[data-image-save]").click();
  const file = await saved;
  expect(await readFile((await file.path())!, "utf8")).toBe(picture);
  await page.locator("[data-image-open]").click();
  await expect.poll(() => chapter(page)).toBe(0);
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url!);
        return true;
      } catch {
        return false;
      }
    }, imageUrl),
  ).toBe(false);
  await page.locator(".reader-tool[data-action=contents]").click();
  await page.locator("[data-reader-tab=bookmarks]").click();
  await page.locator("[data-mark-go]").click();
  await expect.poll(() => chapter(page)).toBe(7);
  await page.locator(".reader-tool[data-action=contents]").click();
  await page.locator("[data-reader-tab=bookmarks]").click();
  await page.locator("[data-mark-remove]").click();
  await expect(page.locator(".navigator-mark")).toHaveCount(0);
});

test("real fonts, publisher typography and page themes survive reopening", async ({
  page,
}) => {
  await importBook(page);
  await page.locator("[data-action=appearance]").click();
  await expect(page.locator("[data-setting=font] option")).toHaveCount(19);
  await page.locator("[data-setting=font]").selectOption("Publisher");
  await expect
    .poll(async () => (await settings(page)).publisherStyles)
    .toBe(true);
  await page.locator("[data-setting=font]").selectOption("Manrope");
  await expect
    .poll(async () => (await settings(page)).publisherStyles)
    .toBe(false);
  await page.locator(".close-modal").click();
  expect(
    await page.evaluate(async () => {
      const d = (
        document.querySelector("foliate-view") as any
      ).renderer.getContents()[0].doc;
      const faces = await d.fonts.load("20px BooksManrope");
      return (
        faces.length > 0 &&
        d.fonts.check("20px BooksManrope") &&
        d.defaultView
          .getComputedStyle(d.querySelector("p"))
          .fontFamily.includes("BooksManrope")
      );
    }),
  ).toBe(true);
  await page.locator("[data-action=appearance]").click();
  await page.locator("#browse-fonts").click();
  await expect(page.locator("[data-reader-font]")).toHaveCount(19);
  await page.locator('[aria-label="Find a font"]').fill("Lora");
  await expect(page.locator("[data-reader-font]:visible")).toHaveCount(1);
  await page.locator("[data-reader-font=Lora]").click();
  await page.locator(".close-modal").click();
  await page.locator("[data-action=appearance]").click();
  await page.locator(".page-colors summary").click();
  await expect(page.locator("[data-theme]")).toHaveCount(38);
  await page.locator("[data-theme=matcha]").click();
  await page.locator(".close-modal").click();
  await page.locator("[data-action=exit]").click();
  await page.reload();
  expect((await settings(page)).font).toBe("Lora");
  expect((await settings(page)).theme).toBe("matcha");
  await page.locator("[data-tab=library]").click();
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(
    () =>
      !!(document.querySelector("foliate-view") as any)?.renderer?.getContents()
        .length,
  );
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const d = (
          document.querySelector("foliate-view") as any
        ).renderer.getContents()[0].doc;
        const faces = await d.fonts.load("20px BooksLora");
        return faces.length > 0 && d.fonts.check("20px BooksLora");
      }),
    )
    .toBe(true);
});

test("download imports offline, saves unchanged book bytes, and rejects unsupported links", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("https://books.test/garden.epub", (r) =>
    r.fulfill({ contentType: "application/epub+zip", body: epub }),
  );
  await page.locator("[data-action=download-book]").click();
  await page.locator("[name=url]").fill("https://books.test/garden.epub");
  await page.locator("#download-book-form button[type=submit]").click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await expect(page.locator(".download-entry")).toBeVisible();
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(
    () =>
      !!(document.querySelector("foliate-view") as any)?.renderer?.getContents()
        .length,
  );
  await page.locator(".reader-tool[data-action=more]").click();
  const saved = page.waitForEvent("download");
  await page.locator("[data-reader-option=save-book]").click();
  expect(await readFile((await (await saved).path())!)).toEqual(epub);
  await page.locator("[data-action=exit]").click();
  await page.route("https://books.test/not-a-book.bin", (r) =>
    r.fulfill({ contentType: "application/octet-stream", body: "not a book" }),
  );
  await page.locator("[data-action=download-book]").click();
  await page.locator("[name=url]").fill("https://books.test/not-a-book.bin");
  await page.locator("#download-book-form button[type=submit]").click();
  await expect(page.locator(".download-status")).toContainText(
    "not a supported",
  );
  await page.locator(".close-modal").click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.reload();
  await page.locator("[data-tab=library]").click();
  await expect(page.locator(".book-card")).toHaveCount(1);
});

test("interface themes persist and reduced motion prevents interaction animation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("[data-tab=profile]").click();
  await page.locator("[data-shortcut=settings]").first().click();
  await page.locator(".settings-panel summary").first().click();
  await page.locator("[data-action=app-themes]").click();
  await expect(page.locator("[data-app-palette]")).toHaveCount(27);
  for (const id of ["forest", "navy", "plum", "sand"]) {
    await page.locator(`[data-app-palette=${id}]`).click();
    await expect(page.locator("html")).toHaveAttribute("data-app-theme", id);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator(".close-modal").click();
  await page.locator("[data-tab=home]").click();
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
  ).toBe(0);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-app-theme", "sand");
});

test("highlight keeps inline words readable and remains one saved mark after reopen", async ({
  page,
}) => {
  await importBook(page);
  await page.waitForFunction(() => {
    const v = document.querySelector("foliate-view") as any,
      d = v?.renderer?.getContents()[0]?.doc;
    return (
      v?.lastLocation?.range &&
      d?.fonts.status === "loaded" &&
      [...d.images].every((i: any) => i.complete)
    );
  });
  await selectPassage(page);
  await page.locator("[data-selection=palette]").click();
  await expect(page.locator(".selection-palette")).toBeVisible();
  await page.locator("[data-selection=highlight]").click();
  await expect(page.locator("#toast")).toContainText("highlighted");
  const overlays = () =>
    page.evaluate(() => {
      const overlay = (
        document.querySelector("foliate-view") as any
      ).renderer.getContents()[0].overlayer;
      return [...overlay.element.querySelectorAll("g[opacity]")].map(
        (g: any) => ({
          opacity: getComputedStyle(g).opacity,
          blend: getComputedStyle(g).mixBlendMode,
          rects: g.children.length,
          childOpacity: [...g.children].some((r: any) =>
            r.hasAttribute("opacity"),
          ),
        }),
      );
    });
  const drawn = await overlays();
  expect(drawn.length).toBeGreaterThan(0);
  expect(drawn.every((x) => x.rects > 0 && !x.childOpacity && Number(x.opacity) <= 0.5 && x.blend === "multiply")).toBe(
    true,
  );
  await page.locator("[data-action=exit]").click();
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(
    () =>
      !!(document.querySelector("foliate-view") as any)?.renderer?.getContents()
        .length,
  );
  await expect.poll(async () => (await overlays()).some(x => x.rects > 0)).toBe(true);
  await page.locator(".reader-tool[data-action=notes]").click();
  await expect(page.locator(".mark-card")).toHaveCount(1);
});

// Compare actual rendered glyphs, not only the renderer's opacity settings.
for (const theme of ["paper", "night"] as const) test(`saved ${theme} marker preserves ink contrast across inline emphasis`, async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 850 });
  await importBook(page);
  await page.locator('[data-action="appearance"]').click();
  await page.locator('.page-colors summary').click();
  await page.locator(`[data-theme="${theme}"]`).click();
  await page.locator('.close-modal').click();
  await page.waitForFunction(() => (document.querySelector('foliate-view') as any).renderer.getContents()[0].doc.fonts.status === 'loaded');
  await selectPassage(page);
  await page.locator('[data-selection="highlight"]').click();
  await expect(page.locator('#selection-tools')).toBeHidden();
  const clip = await page.evaluate(() => {
    const item = (document.querySelector('foliate-view') as any).renderer.getContents()[0];
    const r = item.doc.querySelector('p').getBoundingClientRect(), f = item.doc.defaultView.frameElement.getBoundingClientRect();
    return {x: Math.floor(r.x + f.x), y: Math.floor(r.y + f.y), width: Math.ceil(r.width), height: Math.ceil(r.height)};
  });
  const marked = (await page.screenshot({clip, animations: 'disabled'})).toString('base64');
  await page.evaluate(() => (document.querySelector('foliate-view') as any).renderer.getContents()[0].overlayer.element.style.visibility = 'hidden');
  const plain = (await page.screenshot({clip, animations: 'disabled'})).toString('base64');
  await page.evaluate(() => (document.querySelector('foliate-view') as any).renderer.getContents()[0].overlayer.element.style.visibility = '');
  const pixels = await page.evaluate(async ({marked, plain, theme}) => {
    const decode = async (data: string) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const a = await decode(plain), b = await decode(marked);
    let ink = 0, washedOut = 0, changedPaper = 0;
    for (let i = 0; i < a.length; i += 4) {
      const isInk = theme === 'paper' ? Math.max(a[i], a[i+1], a[i+2]) < 100 : Math.min(a[i], a[i+1], a[i+2]) > 140;
      if (isInk) {
        ink++;
        if ([0,1,2].some(k => theme === 'paper' ? b[i+k] > a[i+k] + 2 : b[i+k] < a[i+k] - 2)) washedOut++;
      } else if (Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]) > 15) changedPaper++;
    }
    return {ink, washedOut, changedPaper};
  }, {marked, plain, theme});
  expect(pixels.ink).toBeGreaterThan(200);
  expect(pixels.washedOut).toBe(0);
  expect(pixels.changedPaper).toBeGreaterThan(500);
});

test("highlight palette has readable choices and touch targets on a narrow phone", async ({page}) => {
  await page.setViewportSize({width: 320, height: 700});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await importBook(page); await selectPassage(page);
  await page.locator('[data-selection="palette"]').click();
  await expect(page.getByRole('button', {name:'Honey highlight'})).toHaveAttribute('aria-pressed','true');
  const bounds = await page.locator('#selection-tools').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(700);
  for (const control of await page.locator('#selection-tools button:visible,#selection-tools .custom-highlight').all()) {
    const r = await control.boundingBox(); expect(r!.width).toBeGreaterThanOrEqual(44); expect(r!.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('[data-selection-style="Underline"]').click();
  await expect(page.locator('.selection-preview span')).toHaveCSS('text-decoration-line','underline');
  await page.getByRole('button',{name:'Sky highlight'}).click();
  await expect(page.locator('#selection-tools')).toBeHidden();
  await selectPassage(page); await page.locator('[data-selection="palette"]').click();
  await expect(page.locator('#highlight-custom-color')).toHaveValue('#9fc9da');
  await expect(page.getByRole('button',{name:'Sky highlight'})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape'); await expect(page.locator('#selection-tools')).toBeHidden();
});

test("read-aloud voice preview, language filter, sentence controls and word feedback work", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.SpeechSynthesisUtterance = class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    };
    w.spoken = [];
    speechSynthesis.getVoices = () =>
      [
        { name: "Natural English", lang: "en-US", localService: true },
        { name: "Hindi", lang: "hi-IN", localService: false },
      ] as any;
    speechSynthesis.speak = (u) => {
      w.spoken.push(u.text);
      w.utterance = u;
    };
    speechSynthesis.cancel = () => {};
    speechSynthesis.pause = () => {
      w.didPause = true;
    };
    speechSynthesis.resume = () => {
      w.didPause = false;
    };
  });
  await importBook(page);
  await page.locator("[data-action=speech]").click();
  await page.locator("#tts-language").selectOption("en-US");
  await expect(page.locator("#tts-voice option")).toHaveCount(2);
  await page.locator("#tts-voice").selectOption("Natural English");
  await expect(page.locator(".voice-detail")).toContainText("Works offline");
  await page.locator("#preview-voice").click();
  expect(await page.evaluate(() => (window as any).spoken.length)).toBe(1);
  await page.locator('[data-speech-rate="1.25"]').click();
  await page.locator("#start-speech").click();
  await expect(page.locator(".tts-now-playing")).toBeVisible();
  for(const width of [360,412]){await page.setViewportSize({width,height:800});await expect.poll(async()=>(await page.locator('.tts-now-playing').boundingBox())!.height).toBeLessThan(210);for(const svg of await page.locator('.tts-transport svg').all())expect((await svg.boundingBox())!.width).toBeGreaterThanOrEqual(17);}
  const first = await page.locator(".tts-current-line").innerText();
  await page.locator("[data-action=speech-next]").click();
  await expect(page.locator(".tts-current-line")).not.toHaveText(first);
  await page.locator("[data-action=speech-previous]").click();
  await expect(page.locator(".tts-current-line")).toHaveText(first);
  await page.locator("[data-action=speech-pause]").click();
  expect(await page.evaluate(() => (window as any).didPause)).toBe(true);
  await page.locator("[data-action=speech-pause]").click();
  expect(await page.evaluate(() => (window as any).didPause)).toBe(false);
  await page.evaluate(() =>
    (window as any).utterance.onboundary({ charIndex: 0, charLength: 7 }),
  );
  await expect(page.locator(".tts-current-line mark")).toBeVisible();
  await page.locator("[data-action=speech-stop]").click();
  await expect(page.locator(".tts-now-playing")).toHaveCount(0);
});

test("PDF gallery renders real pages, saves a PNG and returns to the chosen page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.locator("#file-input").setInputFiles("tests/fixtures/reading.pdf");
  await page.locator(".book-cover-button").click();
  await expect(page.locator(".pdf-page img")).toBeVisible();
  await page.locator(".reader-tool[data-action=contents]").click();
  await page.locator("[data-reader-tab=images]").click();
  await expect(page.locator("[data-image]")).toHaveCount(2);
  await page.locator('[data-image="1"]').click();
  expect((await page.locator(".gallery-preview").boundingBox())!.width).toBe(
    360,
  );
  const download = page.waitForEvent("download");
  await page.locator("[data-image-save]").click();
  const bytes = await readFile((await (await download).path())!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  await page.locator("[data-image-open]").click();
  await expect(page.locator("#chapter-name")).toContainText("2");
});

test('Bookmarks combines every saved style and note, jumps to text and deletes its real overlay', async ({page}) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:360,height:800});
  await importBook(page);
  for (const [i, style] of ['Highlight','Underline','StrikeOut','Squiggly'].entries()) {
    await page.evaluate(i => (document.querySelector('foliate-view') as any).goTo(`c${i}.xhtml`), i);
    await expect.poll(() => chapter(page)).toBe(i);
    await selectPassage(page);
    await page.locator('[data-selection=palette]').click();
    await page.locator(`[data-selection-style=${style}]`).click();
    if (i === 3) {
      await page.locator('[data-selection=note]').click();
      await page.locator('.annotation-dialog textarea').fill('Remember the quiet garden');
      await page.locator('.annotation-dialog button[type=submit]').click();
    } else await page.locator('[data-selection=highlight]').click();
    await expect(page.locator('#selection-tools')).toBeHidden();
  }
  await page.locator('.reader-tool[data-action=contents]').click();
  await page.locator('[data-reader-tab=bookmarks]').click();
  await page.locator('#navigator-add-bookmark').click();
  await expect(page.locator('.navigator-mark')).toHaveCount(5);
  for (const label of ['Highlight','Underline','Strikethrough','Wavy underline · Note','Page bookmark'])
    await expect(page.locator('.navigator-mark-label').filter({hasText:new RegExp(`^${label}$`)})).toHaveCount(1);
  await expect(page.locator('.navigator-mark-note')).toHaveText('Remember the quiet garden');
  await page.locator('#navigator-marks-search').fill('Remember');
  await expect(page.locator('.navigator-mark')).toHaveCount(1);
  await page.locator('#navigator-marks-search').fill('not-present');
  await expect(page.locator('.navigator-empty')).toContainText('No matching');
  await page.locator('#navigator-marks-search').fill('');
  await page.screenshot({path:'docs/screenshots/reading-1.5.2/bookmarks.png'});
  await page.locator('.navigator-mark').filter({has:page.locator('.navigator-mark-label', {hasText:/^Underline$/})}).locator('[data-mark-go]').click();
  await expect.poll(() => chapter(page)).toBe(1);
  const overlays = () => page.evaluate(() => (document.querySelector('foliate-view') as any).renderer.getContents()[0].overlayer.element.children.length);
  await expect.poll(overlays).toBeGreaterThan(0);
  await page.locator('.reader-tool[data-action=contents]').click();
  await page.locator('[data-reader-tab=bookmarks]').click();
  await page.getByRole('button',{name:'Remove underline', exact:true}).click();
  await expect(page.locator('.navigator-mark')).toHaveCount(4);
  await page.locator('.close-modal').click();
  await expect.poll(overlays).toBe(0);
  await page.locator('[data-action=exit]').click();
  await page.reload();
  await page.locator('[data-tab=library]').click();
  await page.locator('.book-cover-button').click();
  await page.locator('.reader-tool[data-action=contents]').click();
  await page.locator('[data-reader-tab=bookmarks]').click();
  await expect(page.locator('.navigator-mark')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('voice language changes the actual preview voice and keeps the choice after reopen', async ({page}) => {
  await page.addInitScript(() => {
    const w=window as any;
    w.SpeechSynthesisUtterance=class {constructor(public text:string){}};
    speechSynthesis.getVoices=()=>[{name:'English voice',lang:'en-US',localService:true},{name:'Hindi voice',lang:'hi-IN',localService:true}] as any;
    speechSynthesis.speak=u=>{w.lastPreview={text:u.text,name:u.voice?.name};queueMicrotask(()=>u.onend?.({} as any))};
    speechSynthesis.cancel=()=>{};
  });
  await importBook(page);
  await page.locator('[data-action=speech]').click();
  await page.locator('#tts-language').selectOption('hi-IN');
  await expect(page.locator('#tts-voice')).toHaveValue('Hindi voice');
  await page.locator('#preview-voice').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).lastPreview?.name)).toBe('Hindi voice');
  expect(await page.evaluate(()=>(window as any).lastPreview.text)).toMatch(/किताब/);
  await page.locator('.voice-setup summary').first().click();
  await page.locator('#voice-sample').fill('मेरा अगला अध्याय');
  await page.locator('#preview-voice').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).lastPreview?.text)).toBe('मेरा अगला अध्याय');
  await page.locator('.close-modal').click();
  await page.locator('[data-action=speech]').click();
  await expect(page.locator('#tts-voice')).toHaveValue('Hindi voice');
});

test('Android voice provider choice reaches preview and playback, handles missing voice data', async ({page}) => {
  await importBook(page);
  await page.evaluate(() => {
    const w=window as any; w.voiceCalls=[];
    w.BooksNative={request:(id:string,action:string,json:string)=>{
      const data=JSON.parse(json);w.voiceCalls.push({action,data});
      let result:any=true;
      if(action==='voicePackStatus')result={state:'available',bytes:0,total:132353410,message:''};
      if(action==='voiceEngines')result=[{name:'test.google',label:'Google Speech',default:true},{name:'test.kokoro',label:'SC Kokoro',default:false}];
      if(action==='voices')result=data.engine==='test.kokoro'?[{name:'Heart',language:'en-US',network:false,quality:500,installed:true},{name:'Bella',language:'en-US',network:false,quality:500,installed:false}]:[{name:'English',language:'en-US',network:true,quality:400,installed:true}];
      queueMicrotask(()=>w.__nativeResult(id,true,result));
    }};
  });
  await page.setViewportSize({width:360,height:800});
  await page.locator('[data-action=speech]').click();
  await page.locator('.voice-setup > summary').click();
  await page.locator('#tts-engine').selectOption('test.kokoro');
  await expect(page.locator('#tts-voice option')).toHaveCount(3);
  await page.locator('#tts-voice').selectOption('Bella');
  await expect(page.locator('#start-speech')).toBeDisabled();
  await expect(page.locator('#preview-voice')).toBeDisabled();
  await page.locator('#tts-voice').selectOption('Heart');
  await page.locator('#preview-voice').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).voiceCalls.find((c:any)=>c.action==='previewVoice')?.data.engine)).toBe('test.kokoro');
  await page.locator('.free-voices summary').click();
  await expect(page.locator('.free-voices a')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#tts-engine').scrollIntoViewIfNeeded();
  await page.screenshot({path:'docs/screenshots/reading-1.6.0/providers.png'});
  await page.locator('#start-speech').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).voiceCalls.find((c:any)=>c.action==='speak')?.data.voice)).toBe('Heart');
  expect(await page.evaluate(()=>(window as any).voiceCalls.find((c:any)=>c.action==='speak').data.engine)).toBe('test.kokoro');
  expect((await settings(page)).ttsEngine).toBe('test.kokoro');
});

test('theme studio filters 27 palettes, persists selection and coordinates 20 new reading papers', async ({page}) => {
  await page.setViewportSize({width:360,height:800});
  await page.goto('/');await page.locator('[data-action=app-themes]').click();
  await expect(page.locator('[data-app-palette]')).toHaveCount(27);
  await page.locator('[data-theme-filter=light]').click();
  await expect(page.locator('[data-app-palette]:visible')).toHaveCount(12);
  await page.getByRole('searchbox',{name:'Search themes'}).fill('sea');
  await expect(page.locator('[data-app-palette]:visible')).toHaveCount(1);
  await page.locator('[data-app-palette=seafoam]').click();
  await expect(page.locator('html')).toHaveAttribute('data-app-theme','seafoam');
  await expect(page.locator('.theme-current')).toContainText('Sea glass');
  await page.getByRole('searchbox',{name:'Search themes'}).fill('');
  await page.screenshot({path:'docs/screenshots/reading-1.6.0/themes-light.png'});
  await page.locator('[data-theme-filter=dark]').click();
  await expect(page.locator('[data-app-palette]:visible')).toHaveCount(15);
  await page.locator('[data-app-palette=espresso]').click();
  await page.waitForTimeout(200); // Allow the intentional theme color transition to finish.
  await page.screenshot({path:'docs/screenshots/reading-1.6.0/themes-dark.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-app-theme','espresso');
  await importBook(page);await page.locator('[data-action=appearance]').click();
  await page.locator('.page-colors summary').click();
  await page.getByRole('searchbox',{name:'Search themes'}).fill('glacier');
  await expect(page.locator('[data-theme]:visible')).toHaveCount(1);
  await page.locator('[data-theme=glacier]').click();
  await expect(page.locator('.appearance-preview')).toHaveCSS('background-color','rgb(231, 239, 245)');
  await page.locator('.close-modal').click();
  expect((await settings(page)).theme).toBe('glacier');
  expect((await settings(page)).appTheme).toBe('espresso');
});

test('downloaded voices select Heart by default with quick choices and language previews',async({page})=>{
 await importBook(page);
 await page.evaluate(()=>{
  const w=window as any;w.calls=[];w.BooksNative={request:(id:string,action:string,json:string)=>{
   const data=JSON.parse(json);w.calls.push({action,data});let result:any=true;
   if(action==='voicePackStatus')result={state:'installed',bytes:132353410,total:132353410,message:''};
   if(action==='voiceEngines')result=[{name:'app.books.reader',label:'Books offline voices',default:false}];
   if(action==='voices')result=[['af_heart','en-US'],['af_bella','en-US'],['hf_alpha','hi-IN']].map(([name,language])=>({name,language,quality:400,network:false,installed:true}));
   queueMicrotask(()=>w.__nativeResult(id,true,result));
  }};
 });
 await page.setViewportSize({width:360,height:800});await page.locator('[data-action=speech]').click();
 await expect(page.locator('#voice-focus-name')).toHaveText('Heart');
 await expect(page.locator('#tts-engine')).toHaveValue('app.books.reader');
 await expect(page.locator('#tts-voice')).toHaveValue('af_heart');
 await expect(page.locator('#start-speech')).toBeEnabled();
 await page.locator('[data-quick-voice=af_bella]').click();
 await expect(page.locator('#voice-focus-name')).toHaveText('Bella');
 await page.locator('#preview-voice').click();
 expect(await page.evaluate(()=>(window as any).calls.find((x:any)=>x.action==='previewVoice').data)).toMatchObject({engine:'app.books.reader',voice:'af_bella'});
 await page.locator('.modal-body').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:'docs/screenshots/reading-1.6.0/listening.png'});
 await page.locator('#tts-language').selectOption('hi-IN');await page.locator('#preview-voice').click();
 expect(await page.evaluate(()=>(window as any).calls.filter((x:any)=>x.action==='previewVoice').at(-1).data)).toMatchObject({voice:'hf_alpha'});
 await page.locator('.close-modal').click();await page.locator('[data-action=speech]').click();
 await expect(page.locator('#voice-focus-name')).toHaveText('Alpha');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('optional voice download keeps phone voices ready, cancels, retries and activates after completion',async({page})=>{
 await importBook(page);
 await page.evaluate(()=>{
  const w=window as any;w.pack={state:'available',bytes:0,total:132353410,message:''};w.calls=[];
  w.BooksNative={request:(id:string,action:string,json:string)=>{
   const data=JSON.parse(json);w.calls.push({action,data});let result:any=true;
   if(action==='voicePackDownload')w.pack={...w.pack,state:'downloading',bytes:30000000,message:''};
   if(action==='voicePackCancel')w.pack={...w.pack,state:'available',bytes:0};
   if(action.startsWith('voicePack'))result=w.pack;
   if(action==='voiceEngines')result=[{name:'phone.speech',label:'Phone speech',default:true},{name:'app.books.reader',label:'Books offline voices',default:false}];
   if(action==='voices')result=data.engine==='app.books.reader'?[{name:'af_heart',language:'en-US',network:false,quality:400,installed:w.pack.state==='installed'}]:[{name:'Phone voice',language:'en-US',network:false,quality:400,installed:true}];
   queueMicrotask(()=>w.__nativeResult(id,true,result));
  }};
 });
 await page.setViewportSize({width:360,height:800});await page.locator('[data-action=speech]').click();
 await expect(page.locator('#preview-voice')).toBeEnabled();await expect(page.locator('#start-speech')).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).calls.filter((x:any)=>x.action==='voicePackDownload'))).toHaveLength(0);
 await page.screenshot({path:'docs/screenshots/reading-1.6.1/optional-voices.png'});
 await page.locator('#download-voice-pack').click();
 await expect(page.locator('#voice-pack-status')).toContainText('30.0 / 132 MB');
 await expect(page.locator('#start-speech')).toBeEnabled();
 await page.locator('#cancel-voice-pack').click();await expect(page.locator('#download-voice-pack')).toBeVisible();
 await page.locator('#download-voice-pack').click();
 await expect(page.locator('#cancel-voice-pack')).toBeVisible();
 await page.evaluate(()=>(window as any).pack={state:'error',bytes:0,total:132353410,message:'Connection lost. Retry download.'});
 await expect(page.locator('#download-voice-pack')).toHaveText('Retry download');
 await expect(page.locator('#start-speech')).toBeEnabled();
 await page.locator('#download-voice-pack').click();
 await page.locator('.close-modal').click();await page.locator('[data-action=speech]').click();
 await expect(page.locator('#cancel-voice-pack')).toBeVisible();
 await page.evaluate(()=>(window as any).pack={state:'installed',bytes:132353410,total:132353410,message:''});
 await expect(page.locator('#voice-focus-name')).toHaveText('Heart');
 await expect(page.locator('#voice-pack-status')).toContainText('ready offline');
 await expect(page.locator('#tts-voice')).toHaveValue('af_heart');
 await expect(page.locator('#download-voice-pack')).toBeHidden();
 await page.locator('#preview-voice').click();
 expect(await page.evaluate(()=>(window as any).calls.filter((x:any)=>x.action==='previewVoice').at(-1).data.engine)).toBe('app.books.reader');
 expect((await settings(page)).ttsPackAutoUse).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
