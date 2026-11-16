import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import * as mupdf from "mupdf";
const root = process.cwd();
async function upload(page: any, file = "tests/fixtures/story.txt") {
  await page.locator("#file-input").setInputFiles(path.join(root, file));
  await expect(page.locator(".book-card")).toHaveCount(1);
}
async function open(page: any) {
  await page.locator(".book-cover-button").first().click();
  await expect(page.locator("#reader")).toBeVisible();
  await expect(page.locator("foliate-view")).toBeVisible();
  await page.waitForFunction(
    () =>
      !!(document.querySelector("foliate-view") as any)?.renderer?.getContents()
        ?.length,
  );
}
async function selectText(page: any) {
  return page.evaluate(() => {
    const view: any = document.querySelector("foliate-view");
    const item = view.renderer.getContents()[0];
    const p = [...item.doc.querySelectorAll("p")].find(
      (p: any) => p.textContent.trim().length > 40,
    ) as any;
    const range = item.doc.createRange();
    range.selectNodeContents(p);
    item.doc.defaultView.getSelection().removeAllRanges();
    item.doc.defaultView.getSelection().addRange(range);
    item.doc.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    return p.textContent;
  });
}
async function palette(page: any) {
  const button = page.locator('[data-selection="palette"]');
  if (await button.getAttribute("aria-expanded") !== "true") await button.click();
}
async function navigate(page: any, name: string) {
  await page.locator('[data-action="mobile-menu"]').click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: ({"My Shelf":"Library","Options":"Settings","Bookmarks":"Notes & highlights"} as Record<string,string>)[name] ?? name, exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("home resumes real books and cloud setup is reachable from Settings", async ({ page }) => {
  await expect(page.locator(".home-page")).toBeVisible();
  await page.locator('[data-tab="profile"]').click();await page.locator('[data-shortcut="settings"]').first().click();
  await page.locator('summary').filter({hasText:'Cloud synchronization'}).click();
  await page.locator('[data-action="connect-cloud"]').click();
  await page.locator('select[name="provider"]').selectOption("dropbox");
  await expect(page.locator("#dropbox-fields")).toBeVisible();
  await page.locator(".close-modal").click();
  await upload(page);
  await open(page);
  await page.locator('[data-action="exit"]').click();
  await page.locator('[data-tab="home"]').click();
  await expect(page.locator(".home-book-rail [data-open]")).toHaveCount(1);
  await page.locator(".continue-copy [data-open]").click();
  await expect(page.locator("foliate-view")).toBeVisible();
});

test("tap a saved highlight to restyle, edit or clear its note, and delete it on the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 800 });
  await upload(page);
  await open(page);
  const point = await page.evaluate(() => {
    const view: any = document.querySelector("foliate-view");
    const doc = view.renderer.getContents()[0].doc;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode())
      if (walker.currentNode.textContent.trim().length > 40) break;
    const range = doc.createRange();
    range.setStart(walker.currentNode, 0);
    range.setEnd(walker.currentNode, 32);
    const rect = range.getClientRects()[0],
      frame = doc.defaultView.frameElement.getBoundingClientRect();
    doc.getSelection().removeAllRanges();
    doc.getSelection().addRange(range);
    doc.dispatchEvent(new Event("selectionchange"));
    return {
      x: frame.x + rect.x + 8,
      y: frame.y + rect.y + rect.height / 2,
      bottom: frame.y + rect.bottom,
    };
  });
  await expect(page.locator("#selection-tools")).toBeVisible();
  const tools = await page.locator("#selection-tools").boundingBox();
  expect(tools!.y > point.bottom || tools!.y + tools!.height < point.y).toBe(true);
  await palette(page);
  await page.locator("[data-color]").first().click();
  await expect(page.locator("#selection-tools")).toBeHidden();
  const tap = async () => {
    await page.mouse.click(point.x, point.y);
    await expect(page.locator('[data-selection="delete"]')).toBeVisible();
    await expect(page.locator(".modal")).toHaveCount(0);
  };
  await tap();
  await palette(page);
  await page.locator('[data-selection-style="StrikeOut"]').click();
  await palette(page);
  await page.locator("[data-color]").nth(1).click();
  await expect(page.locator("#selection-tools")).toBeHidden();
  await tap();
  await expect(
    page.locator('[data-selection-style="StrikeOut"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-color]").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('[data-selection="note"]').click();
  await page
    .locator("#input-dialog textarea")
    .fill("Edit this note from the passage");
  await page.locator("#input-dialog button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("Note saved");
  await tap();
  await page.locator('[data-selection="note"]').click();
  await expect(page.locator("#input-dialog textarea")).toHaveValue(
    "Edit this note from the passage",
  );
  await page.locator("#input-dialog textarea").fill("");
  await page.locator("#input-dialog button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("highlighted");
  await tap();
  await page.locator('[data-selection="delete"]').click();
  await expect(page.locator("#selection-tools")).toBeHidden();
  await page.locator('[data-action="more"]').first().click();
  await page.locator('[data-reader-option="notes"]').click();
  await expect(page.locator(".mark-card")).toHaveCount(0);
});

test("one native-style swipe turns one page and slide avoids screenshot capture", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 800 });
  await upload(page);
  await open(page);
  await page.locator('[data-action="appearance"]').click();
  await page.locator('[data-setting="flow"]').selectOption("paginated");
  await page.locator('[data-setting="animation"]').selectOption("slide");
  await page.locator(".close-modal").click();
  const before = await page.evaluate(() => {
    const r = (document.querySelector("foliate-view") as any).renderer;
    return { start: r.start, size: r.size };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 325, y: 300 }],
  });
  for (let x = 300; x >= 100; x -= 25) {
    await page.waitForTimeout(40);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: 300 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(500);
  expect(
    Math.abs(
      (await page.evaluate(
        () => (document.querySelector("foliate-view") as any).renderer.start,
      )) -
        before.start -
        before.size,
    ),
  ).toBeLessThan(1.1);
  await page.evaluate(() => {
    (window as any).__captures = 0;
    window.BooksNative = {
      request(id, action) {
        if (action === "capture") (window as any).__captures++;
        window.__nativeResult?.(id, true, true);
      },
    };
  });
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__captures)).toBe(0);
  expect(
    Math.abs(
      (await page.evaluate(
        () => (document.querySelector("foliate-view") as any).renderer.start,
      )) -
        before.start -
        2 * before.size,
    ),
  ).toBeLessThan(1.1);
  await cdp.detach();
});
test("imports a real EPUB, deduplicates files, and searches the shelf", async ({
  page,
}) => {
  await upload(page, "public/samples/alice.epub");
  await expect(page.locator(".book-title")).toContainText("Alice");
  await upload(page, "public/samples/alice.epub");
  await page.locator('[data-action="focus-search"]').click();
  await page.locator("#library-search").fill("nothing-matches-this-title");
  await expect(page.locator(".book-card")).toHaveCount(0);
  await expect(page.getByText("No books found")).toBeVisible();
  await page.locator("#library-search").fill("alice");
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/library-desktop.png",
    fullPage: true,
  });
});
test("persists reading location, bookmarks, highlights, and appearance", async ({
  page,
}) => {
  await upload(page);
  await open(page);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(700);
  await page.locator(".reader-top-actions [data-action=bookmark]").click();
  await expect(page.locator("#toast")).toContainText("bookmarked");
  await selectText(page);
  await expect(page.locator("#selection-tools")).toBeVisible();
  await palette(page);
  await page.locator("[data-color]").first().click();
  await expect(page.locator("#toast")).toContainText("highlighted");
  await page.locator("[data-action=appearance]").click();
  await page.locator(".page-colors > summary").click();
  await page.locator("[data-theme=sepia]").click();
  await page.locator("[data-setting=fontSize]").fill("24");
  await page.locator(".close-modal").click();
  await page.screenshot({ path: "test-results/reader-desktop.png" });
  await page.locator("[data-action=exit]").click();
  await navigate(page, "Bookmarks");
  await expect(page.locator(".journal-entry")).toHaveCount(2);
  await page.reload();
  await navigate(page, "Bookmarks");
  await expect(page.locator(".journal-entry")).toHaveCount(2);
  await navigate(page, "My Shelf");
  await open(page);
  await page.locator("[data-action=appearance]").click();
  await expect(page.locator("[data-theme=sepia]")).toHaveClass(/selected/);
  await expect(page.locator("[data-setting=fontSize]")).toHaveValue("24");
});
test("adds a note and exports the real notebook", async ({ page }) => {
  await upload(page);
  await open(page);
  await selectText(page);
  await page.locator("[data-selection=note]").click();
  await page.locator("#input-dialog textarea").fill("A thought worth keeping.");
  await page.locator("#input-dialog button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("Note saved");
  await page.locator("[data-action=exit]").click();
  await navigate(page, "Bookmarks");
  await expect(page.locator(".journal-thought")).toHaveText(
    "A thought worth keeping.",
  );
  const download = page.waitForEvent("download");
  await page.locator("[data-action=export-notes]").click();
  const artifact = await download;
  const data = await fs.readFile((await artifact.path())!, "utf8");
  expect(data).toContain("A thought worth keeping.");
  expect(data).toContain("reading room");
});
test("searches the entire text and navigates to a result", async ({ page }) => {
  await upload(page);
  await open(page);
  await page.locator(".reader-toolbar [data-action=more]").click();
  await page.locator("[data-reader-option=search]").click();
  await page.locator("#book-search input").fill("understanding");
  await page.locator("#book-search button").click();
  await expect(page.locator(".search-result").first()).toBeVisible();
  await page.locator(".search-result").first().click();
  await expect(page.locator(".modal")).toHaveCount(0);
});
test("renders PDF text and forms and exports embedded handwriting and text", async ({
  page,
}) => {
  await upload(page, "tests/fixtures/reading.pdf");
  await page.locator(".book-cover-button").click();
  await expect(page.locator(".pdf-page")).toBeVisible();
  await expect(page.locator(".pdf-text-layer")).toContainText(
    "A quiet beginning",
  );
  await expect(page.locator("[aria-label=reader_name]")).toHaveValue("Mira");
  await page.locator("[aria-label=reader_name]").fill("Books reader");
  await page.locator("[aria-label=reader_name]").press("Tab");
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator('[data-reader-option="miscellaneous"]').click();
  await page.locator("#pdf-pen").click();
  const canvas = page.locator(".pdf-ink.active");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 210, { steps: 6 });
  await page.mouse.move(box.x + 160, box.y + 170, { steps: 6 });
  await page.mouse.up();
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator('[data-reader-option="miscellaneous"]').click();
  await page.locator("#pdf-pen").click();
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator('[data-reader-option="miscellaneous"]').click();
  await page.locator("#pdf-text").click();
  await page.locator("#input-dialog input").fill("A real PDF annotation.");
  await page.locator("#input-dialog button").click();
  await expect(page.locator("#toast")).toContainText("Text annotation added");
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator('[data-reader-option="miscellaneous"]').click();
  const promise = page.waitForEvent("download");
  await page.locator("#pdf-export").click();
  const file = await promise;
  expect((await fs.stat((await file.path())!)).size).toBeGreaterThan(1000);
  const exported = mupdf.Document.openDocument(
    new Uint8Array(await fs.readFile((await file.path())!)),
    "application/pdf",
  ) as mupdf.PDFDocument;
  const pdfPage = exported.loadPage(0);
  const annotations = pdfPage.getAnnotations();
  expect(
    annotations.some(
      (a) => a.getType() === "Ink" && a.getInkList()[0].length > 4,
    ),
  ).toBe(true);
  expect(
    annotations.some(
      (a) =>
        a.getType() === "FreeText" &&
        a.getContents() === "A real PDF annotation.",
    ),
  ).toBe(true);
  const fields = pdfPage.getWidgets();
  expect(fields[0].getValue()).toBe("Books reader");
  fields.forEach((f) => f.destroy());
  annotations.forEach((a) => a.destroy());
  pdfPage.destroy();
  exported.destroy();
  await page.screenshot({ path: "test-results/pdf-desktop.png" });
  await page.locator(".close-modal").click();
  await page.locator("[data-action=exit]").click();
  await page.locator(".book-cover-button").click();
  await expect(page.locator("[aria-label=reader_name]")).toHaveValue(
    "Books reader",
  );
});
test("merges a full backup without duplicating book files", async ({
  page,
}) => {
  await upload(page);
  await navigate(page, "Options");
  await page.locator("summary").filter({hasText:"Backup and restore"}).click();
  const promise = page.waitForEvent("download");
  await page.locator("[data-action=backup]").click();
  const backup = await promise;
  const file = await backup.path();
  await page.locator("#restore-input").setInputFiles(file!);
  await expect(page.locator("#toast")).toContainText("1 books restored");
  await navigate(page, "My Shelf");
  await expect(page.locator(".book-card")).toHaveCount(1);
  await open(page);
});
test("imports document formats and blocks executable book content", async ({
  page,
}) => {
  for (const [i, filename] of [
    "office.docx",
    "office.odt",
    "story.md",
    "story.rtf",
    "unsafe.html",
  ].entries()) {
    await page
      .locator("#file-input")
      .setInputFiles(path.join(root, "tests/fixtures", filename));
    await expect(page.locator(".book-card")).toHaveCount(i + 1);
  }
  await expect(page.locator(".book-card")).toHaveCount(5);
  await page
    .locator(".book-card")
    .filter({ hasText: "unsafe" })
    .locator(".book-cover-button")
    .click();
  await expect(page.locator("foliate-view")).toBeVisible();
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => (window as any).__bookExecuted),
  ).toBeUndefined();
});
test("edits collections, favorites, ratings, and finished state", async ({
  page,
}) => {
  await upload(page);
  await page.locator("[data-book-menu]").click();
  await page.getByRole("button", { name: "Rate 4 stars" }).click();
  await page.locator("[data-book-action=favorite]").click();
  await page.locator(".close-modal").click();
  await expect(page.locator(".favorite-indicator")).toBeVisible();
  await page.locator("[data-book-menu]").click();
  await page.locator(".portrait-manage summary").click();
  await page.locator("[data-book-action=edit]").click();
  await page.locator("[name=tags]").fill("Classics, To read");
  await page.locator("#edit-book button").click();
  await expect(page.locator("[data-collection=Classics]")).toBeVisible();
  await page.locator("[data-book-menu]").click();
  await page.locator(".portrait-manage summary").click();
  await page.locator("[data-book-action=finished]").click();
  await expect(page.locator(".finished-badge")).toBeVisible();
  await page.reload();
  await navigate(page, "My Shelf");
  await expect(page.locator(".favorite-indicator")).toBeVisible();
  await expect(page.locator(".book-rating")).toContainText("4");
});
test("mobile layout has no horizontal overflow and a usable reading toolbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await upload(page, "public/samples/alice.epub");
  await page.screenshot({
    path: "test-results/library-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await open(page);
  await page.screenshot({ path: "test-results/reader-mobile.png" });
  await expect(page.locator(".reader-toolbar")).toBeVisible();
  await page.locator("[data-action=appearance]").click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.screenshot({ path: "test-results/appearance-mobile.png" });
});

test("reads compressed UMD chapters and persists their position", async ({
  page,
}) => {
  await upload(page, "tests/fixtures/reading.umd");
  await expect(page.locator(".book-title")).toHaveText("Books UMD fixture");
  await open(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const v: any = document.querySelector("foliate-view");
        return v.renderer.getContents()[0]?.doc.body?.textContent ?? "";
      }),
    )
    .toContain("real compressed UMD");
  await page.locator(".reader-toolbar [data-action=contents]").click();
  await page
    .getByRole("button", { name: "The second chapter", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const v: any = document.querySelector("foliate-view");
        return v.renderer.getContents()[0]?.doc.body?.textContent ?? "";
      }),
    )
    .toContain("Its chapter links and text work");
  await page.locator("[data-action=exit]").click();
  await expect(page.locator("#reader")).toBeHidden();
  await page.reload();
  await navigate(page, "My Shelf");
  await open(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const v: any = document.querySelector("foliate-view");
        return v.renderer.getContents()[0]?.doc.body?.textContent ?? "";
      }),
    )
    .toContain("Its chapter links and text work");
});

test("renders a real DjVu image through the offline WASM engine", async ({
  page,
}) => {
  await upload(page, "tests/fixtures/boy.djvu");
  await page.locator(".book-cover-button").click();
  const image = page.locator(".pdf-page img");
  await expect(image).toBeVisible();
  const colors = await image.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    const bytes = x.getImageData(0, 0, c.width, c.height).data;
    const values = new Set<number>();
    for (let i = 0; i < bytes.length; i += 32) values.add(bytes[i]);
    return values.size;
  });
  expect(colors).toBeGreaterThan(10);
  await page.screenshot({ path: "test-results/djvu-desktop.png" });
});

test("keeps SVG image references in EPUB pages", async ({ page }) => {
  await upload(page, "public/samples/alice.epub");
  await open(page);
  const images = await page.evaluate(async () => {
    const v: any = document.querySelector("foliate-view");
    const doc = v.renderer.getContents()[0].doc;
    const list = [...doc.querySelectorAll("image,img")];
    return list.map(
      (img: any) =>
        img.getAttribute("href") || img.getAttribute("xlink:href") || img.src,
    );
  });
  expect(images.length).toBeGreaterThan(0);
  expect(images.every(Boolean)).toBe(true);
});

test("opens actual EPUB chapters as valid XHTML with readable paragraphs", async ({
  page,
}) => {
  await upload(page, "public/samples/alice.epub");
  await open(page);
  await page.locator(".reader-toolbar [data-action=contents]").click();
  await page
    .getByRole("button", { name: /CHAPTER I. Down the Rabbit-Hole/ })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const v: any = document.querySelector("foliate-view");
        const doc = v.renderer.getContents()[0]?.doc;
        return doc?.body?.textContent ?? "";
      }),
    )
    .toContain("Alice was beginning");
  expect(
    await page.evaluate(() => {
      const v: any = document.querySelector("foliate-view");
      return !!v.renderer.getContents()[0].doc.querySelector("parsererror");
    }),
  ).toBe(false);
  await page.screenshot({ path: "test-results/epub-chapter.png" });
});

test("preserves Office tables, inline formatting and embedded images", async ({
  page,
}) => {
  for (const format of ["docx", "odt"]) {
    await page
      .locator("#file-input")
      .setInputFiles(path.join(root, `tests/fixtures/rich.${format}`));
    await page
      .locator(".book-card")
      .filter({ hasText: `rich` })
      .last()
      .locator(".book-cover-button")
      .click();
    await page.waitForFunction(
      () =>
        !!(
          document.querySelector("foliate-view") as any
        )?.renderer?.getContents()[0]?.doc.body,
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const v: any = document.querySelector("foliate-view");
          const d = v.renderer.getContents()[0]?.doc;
          return d
            ? {
                cells: d.querySelectorAll("td").length,
                text: d.body?.textContent ?? "",
                images: d.querySelectorAll("img").length,
              }
            : null;
        }),
      )
      .toMatchObject({ cells: 2, images: 1 });
    expect(
      await page.evaluate(async () => {
        const d = (
          document.querySelector("foliate-view") as any
        ).renderer.getContents()[0].doc;
        const image = d.querySelector("img");
        await image.decode();
        return image.naturalWidth;
      }),
    ).toBeGreaterThan(0);
    await page.locator("[data-action=exit]").click();
    await expect(page.locator("#reader")).toBeHidden();
  }
});

test("opens MHTML with its embedded stylesheet and CID image offline", async ({
  page,
}) => {
  await upload(page, "tests/fixtures/embedded.mhtml");
  await open(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const d = (
          document.querySelector("foliate-view") as any
        ).renderer.getContents()[0].doc;
        return d.querySelector(".special")?.textContent;
      }),
    )
    .toBe("Offline artwork and stylesheet.");
  const data = await page.evaluate(async () => {
    const d = (
      document.querySelector("foliate-view") as any
    ).renderer.getContents()[0].doc;
    const img = d.querySelector("img");
    await img.decode();
    return {
      width: img.naturalWidth,
      color: d.defaultView.getComputedStyle(d.querySelector(".special")).color,
    };
  });
  expect(data.width).toBe(64);
  expect(data.color).toBe("rgb(190, 20, 30)");
});

test("applies text processing immediately and preserves it on reopen", async ({
  page,
}) => {
  await upload(page);
  await open(page);
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator("[data-reader-option=miscellaneous]").click();
  await page.locator("#replacements").fill("Mira => Asha");
  await page.locator("#apply-replacements").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            document.querySelector("foliate-view") as any
          ).renderer.getContents()[0]?.doc.body?.textContent ?? "",
      ),
    )
    .toContain("Asha opened");
  await page.locator("[data-action=appearance]").click();
  await page.locator(".advanced-settings:not(.page-colors) > summary").click();
  await page.locator("[data-setting=bionic]").selectOption("half");
  await page.locator("#apply-processing").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (document.querySelector("foliate-view") as any).renderer
            .getContents()[0]
            ?.doc.querySelectorAll("[data-bionic]").length ?? 0,
      ),
    )
    .toBeGreaterThan(5);
  await page.locator("[data-action=exit]").click();
  await expect(page.locator("#reader")).toBeHidden();
  await open(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            document.querySelector("foliate-view") as any
          ).renderer.getContents()[0]?.doc.body?.textContent ?? "",
      ),
    )
    .toContain("Asha opened");
});

test("changes interface language without translating book titles", async ({
  page,
}) => {
  await upload(page);
  await navigate(page, "Options");
  await page.locator(".settings-panel > summary").filter({hasText:"General"}).click();
  await page.locator("[data-setting=language]").selectOption("hi");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await page.locator("[data-action=mobile-menu]").click();
  await expect(page.locator(".sidebar [data-nav=library] > span")).toHaveText(
    "मेरी शेल्फ़",
  );
  await page.locator("[data-nav=library]").click();
  await expect(page.locator(".book-title")).toHaveText("story");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
});

test("imports books from nested archives and supports bulk shelf actions", async ({
  page,
}) => {
  await upload(page, "tests/fixtures/nested-books.zip");
  await page.locator("[data-action=app-menu]").click();
  await page.locator("[data-menu-action=select-books]").click();
  await page.locator("[data-bulk=all]").click();
  await page.locator("[data-bulk=favorite]").click();
  await expect(page.locator(".favorite-indicator")).toBeVisible();
  await open(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            document.querySelector("foliate-view") as any
          ).renderer.getContents()[0]?.doc.body?.textContent ?? "",
      ),
    )
    .toContain("nested archive opens");
});

test("double-tap zooms PDF pages and status-bar templates apply", async ({
  page,
}) => {
  await upload(page, "tests/fixtures/reading.pdf");
  await page.locator(".book-cover-button").click();
  await expect(page.locator(".pdf-page")).toBeVisible();
  const before = (await page.locator(".pdf-page").boundingBox())!.width;
  await page
    .locator(".pdf-text-layer")
    .dblclick({ position: { x: 20, y: 20 } });
  await expect
    .poll(async () => (await page.locator(".pdf-page").boundingBox())!.width)
    .toBeGreaterThan(before * 1.5);
  await page.locator(".reader-top-actions [data-action=more]").click();
  await page.locator("[data-reader-option=miscellaneous]").click();
  await page.locator("[data-setting=miniStatus]").fill("{title} — {percent}");
  await page.getByText("Lock horizontal scrolling", { exact: true }).click();
  await page.locator(".close-modal").click();
  await page.locator(".reader-toolbar [data-action=more]").click();
  await page.locator("[data-reader-option=fullscreen]").click();
  await expect(page.locator(".status-custom")).toContainText("reading —");
  await expect(page.locator("#book-viewport")).toHaveCSS(
    "overflow-x",
    "hidden",
  );
});

test("Android-style selection changes highlight, recolor, persist and delete one passage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 740 });
  await upload(page);
  await open(page);
  const select = async () =>
    page.evaluate(() => {
      const view: any = document.querySelector("foliate-view");
      const doc = view.renderer.getContents()[0].doc;
      const paragraph = [...doc.querySelectorAll("p")].find(
        (p: any) => p.textContent.trim().length > 40,
      );
      const range = doc.createRange();
      range.selectNodeContents(paragraph);
      const selection = doc.defaultView.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      doc.dispatchEvent(new Event("selectionchange"));
    });
  const marks = () =>
    page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("books-reader");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const entries = await new Promise<any[]>((resolve) => {
        const request = database
          .transaction("marks")
          .objectStore("marks")
          .getAll();
        request.onsuccess = () => resolve(request.result);
      });
      database.close();
      return entries.filter((x) => !x.deleted);
    });
  await select();
  await expect(page.locator("#selection-tools")).toBeVisible();
  await palette(page);
  await page.locator("[data-selection-style=Underline]").click();
  await expect(
    page.locator("[data-selection-style=Underline]"),
  ).toHaveAttribute("aria-pressed", "true");
  const target = await page.locator("[data-color]").first().boundingBox();
  expect(target!.width).toBeGreaterThanOrEqual(36);
  expect(target!.height).toBeGreaterThanOrEqual(44);
  await palette(page);
  await page.locator("[data-color]").first().click();
  await expect(page.locator("#toast")).toContainText("highlighted");
  expect(await marks()).toHaveLength(1);
  await select();
  await expect(page.locator("#selection-tools")).toBeVisible();
  await palette(page);
  await page.locator("[data-color]").nth(2).click();
  await expect(page.locator("#selection-tools")).toBeHidden();
  expect(await marks()).toHaveLength(1);
  expect((await marks())[0].color).toBe("#9fc9da");
  await page.locator("[data-action=exit]").click();
  await open(page);
  await page.waitForFunction(
    () =>
      (document.querySelector("foliate-view") as any).renderer.getContents()[0]
        .overlayer.element.childElementCount > 0,
  );
  const spoken = (await marks())[0].quote;
  // Keep browser speech deterministic; the Android suite checks real TTS.
  await page.evaluate(() => {
    speechSynthesis.speak = () => {};
    speechSynthesis.cancel = () => {};
  });
  await page.locator("[data-action=speech]").click();
  await page.locator("#start-speech").click();
  await expect(page.locator(".tts-now-playing")).toBeVisible();
  await page.evaluate(
    (text) =>
      window.dispatchEvent(
        new CustomEvent("native:speech", {
          detail: {
            state: "playing",
            location: (
              document.querySelector("foliate-view") as any
            ).renderer.getContents()[0].index,
            text,
          },
        }),
      ),
    spoken,
  );
  await expect(page.locator(".tts-now-playing")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          document.querySelector("foliate-view") as any
        ).renderer.getContents()[0].overlayer.element.childElementCount,
    ),
  ).toBe(2);
  await expect(page.locator("#selection-tools")).toBeHidden();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("native:speech", { detail: { state: "stopped" } }),
    ),
  );
  expect(
    await page.evaluate(
      () =>
        (
          document.querySelector("foliate-view") as any
        ).renderer.getContents()[0].overlayer.element.childElementCount,
    ),
  ).toBe(1);
  await page.locator("[data-action=more]").first().click();
  await page.locator("[data-reader-option=notes]").click();
  await expect(page.locator(".mark-card")).toHaveCount(1);
  await page.locator("[data-mark-delete]").click();
  await expect(page.locator(".mark-card")).toHaveCount(0);
  expect(await marks()).toHaveLength(0);
});

test("smooth auto-scroll moves beyond one screen and stops immediately", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 740 });
  await upload(page);
  await open(page);
  await page.locator("[data-action=more]").first().click();
  await page.locator("[data-reader-option=autoscroll]").click();
  await page.locator("[data-setting=autoMode]").selectOption("pixel");
  await page.locator("[data-setting=autoSpeed]").fill("150");
  await page.locator("#start-auto").click();
  await page.waitForFunction(
    () => {
      const r = (document.querySelector("foliate-view") as any).renderer;
      return r.scrolled && r.start > r.size + 100;
    },
    { timeout: 10000 },
  );
  await page.locator("[data-auto-stop]").click();
  const stopped = await page.evaluate(
    () => (document.querySelector("foliate-view") as any).renderer.start,
  );
  await page.waitForTimeout(350);
  const after = await page.evaluate(
    () => (document.querySelector("foliate-view") as any).renderer.start,
  );
  expect(Math.abs(after - stopped)).toBeLessThan(2);
  await page.locator("[data-action=exit]").click();
  await open(page);
  expect(
    await page.evaluate(
      () => (document.querySelector("foliate-view") as any).renderer.start,
    ),
  ).toBeGreaterThan(0);
});

test("rapid book-open requests settle on the last book without duplicate readers", async ({
  page,
}) => {
  await upload(page);
  await page
    .locator("#file-input")
    .setInputFiles(path.join(root, "public/samples/alice.epub"));
  await expect(page.locator(".book-card")).toHaveCount(2);
  const last = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll<HTMLElement>(".book-title")];
    buttons[0].click();
    buttons[1].click();
    buttons[1].click();
    return buttons[1].textContent;
  });
  await expect(page.locator(".reader-heading h1")).toHaveText(last!);
  await expect(page.locator("foliate-view")).toHaveCount(1);
  await page.waitForFunction(
    () =>
      (document.querySelector("foliate-view") as any)?.renderer?.getContents()
        ?.length > 0,
  );
  await page.locator("[data-action=exit]").click();
  await expect(page.locator("#reader")).toBeHidden();
  await expect(page.locator(".book-card")).toHaveCount(2);
});
