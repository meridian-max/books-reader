import { test, expect, type Page } from "@playwright/test";
import { manualScrollBook } from "../scripts/manual-scroll-fixture.mjs";
async function open(page: Page) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "Controls.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from(manualScrollBook()),
    });
  await page.locator(".book-cover-button").click();
  await page.waitForFunction(
    () =>
      !!(document.querySelector("foliate-view") as any)?.renderer?.getContents()
        .length,
  );
}
async function menu(page: Page, id: string) {
  await page.locator(".reader-tool[data-action=more]").click();
  await page.locator(`[data-reader-option=${id}]`).click();
}
async function setting(page: Page, key: string, value: number) {
  await page.locator(`[data-setting=${key}]`).evaluate((e: any, v) => {
    e.value = String(v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
const state = (page: Page) =>
  page.evaluate(() => {
    const r = (document.querySelector("foliate-view") as any).renderer;
    return { start: r.start, index: r.getContents()[0].index };
  });
async function tap(page: Page, x: number, y: number) {
  const box = (await page.locator("foliate-view").boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}
async function swipe(page: Page, dx: number, dy: number) {
  const b = (await page.locator("foliate-view").boundingBox())!;
  const x = b.x + b.width * 0.5 - dx / 2,
    y = b.y + b.height * 0.5 - dy / 2;
  const c = await page.context().newCDPSession(page);
  await c.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 10; i++) {
    await c.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }],
    });
    await page.waitForTimeout(25);
  }
  await c.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await c.detach();
  await page.waitForTimeout(500);
}

test("independent margins, font scale, resets and saved themes change real EPUB layout", async ({
  page,
}) => {
  await open(page);
  await page.locator("[data-action=appearance]").click();
  await page.locator(".independent-margins summary").click();
  for (const [key, value] of Object.entries({
    marginLeft: 12,
    marginRight: 42,
    marginTop: 18,
    marginBottom: 32,
  }))
    await setting(page, key, value);
  await page
    .locator(".advanced-settings>summary")
    .filter({ hasText: "Advanced typography" })
    .click();
  await setting(page, "fontScale", 120);
  await setting(page, "fontWeight", 700);
  await page.locator("[data-setting=underline]").check();
  await page.locator("[data-setting=italic]").check();
  await page.locator("[data-setting=justify]").check();
  const actual = await page.evaluate(() => {
    const doc = (
      document.querySelector("foliate-view") as any
    ).renderer.getContents()[0].doc;
    const css = doc.defaultView.getComputedStyle(doc.querySelector("p"));
    const host = getComputedStyle(document.querySelector("#book-viewport")!);
    return {
      size: css.fontSize,
      weight: css.fontWeight,
      italic: css.fontStyle,
      underline: css.textDecorationLine,
      align: css.textAlign,
      padding: host.padding,
    };
  });
  expect(actual).toMatchObject({
    size: "24px",
    weight: "700",
    italic: "italic",
    underline: "underline",
    align: "justify",
    padding: "18px 42px 32px 12px",
  });
  await page.locator("[data-options-page=themes]").click();
  await page.locator("#theme-save").click();
  await page.locator("#input-dialog input").fill("My precise layout");
  await page.locator("#input-dialog button").click();
  await page.locator("[data-action=appearance]").click();
  await setting(page, "margin", 25);
  await page.locator(".close-modal").click();
  await menu(page, "themes");
  await page
    .locator("[data-saved-theme]")
    .filter({ hasText: "My precise layout" })
    .click();
  await expect(page.locator("#book-viewport")).toHaveCSS(
    "padding-left",
    "12px",
  );
  await expect(page.locator("#book-viewport")).toHaveCSS(
    "padding-right",
    "42px",
  );
  await page.locator("[data-action=appearance]").click();
  await page
    .locator(".advanced-settings>summary")
    .filter({ hasText: "Advanced typography" })
    .click();
  await page.locator("[data-reset-group=spacing]").click();
  await page
    .getByRole("searchbox", { name: "Find a setting" })
    .fill("font scale");
  await expect(page.locator("[data-setting=fontScale]")).toHaveValue("100");
  await expect(page.locator("[data-setting=fontScale]")).toBeVisible();
});

test("custom nine-zone taps, previous and next chapter, mini-status tap and long tap perform actions", async ({
  page,
}) => {
  await open(page);
  await menu(page, "controls");
  await page.locator("[data-setting=tapLayout]").selectOption("custom");
  await page.locator('[data-zone="0"]').click();
  await page.locator("#tap-zone-editor select").selectOption("book-info");
  await page.locator('[data-zone="8"]').click();
  await page.locator("#tap-zone-editor select").selectOption("next-chapter");
  await page.screenshot({
    path: "docs/screenshots/reading-1.7.0/tap-grid.png",
  });
  await page.locator(".close-modal").click();
  await tap(page, 0.15, 0.15);
  await expect(
    page.getByRole("dialog", { name: "Book information" }),
  ).toBeVisible();
  await page.locator(".close-modal").click();
  await tap(page, 0.85, 0.85);
  await expect.poll(async () => (await state(page)).index).toBe(2);
  await menu(page, "controls");
  await page.locator('[data-zone="0"]').click();
  await page
    .locator("#tap-zone-editor select")
    .selectOption("previous-chapter");
  await page.locator(".close-modal").click();
  await tap(page, 0.15, 0.15);
  await expect.poll(async () => (await state(page)).index).toBe(0);
  await menu(page, "fullscreen");
  await expect(page.locator(".reader-mini-status")).toBeVisible();
  await page.locator("[data-mini-zone=Left]").click();
  await expect(
    page.getByRole("dialog", { name: "Book information" }),
  ).toBeVisible();
  await page.locator(".close-modal").click();
  const box = (await page.locator("[data-mini-zone=Left]").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(750);
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Brightness" })).toBeVisible();
});

test("horizontal fling opt-out and vertical touch lock leave page controls usable", async ({
  page,
}) => {
  await open(page);
  await page.locator("[data-action=toggle-flow]").click();
  await menu(page, "controls");
  await page
    .getByRole("searchbox", { name: "Find a setting" })
    .fill("horizontal flings");
  await page.locator("[data-setting=horizontalFling]").uncheck();
  await page.locator(".close-modal").click();
  const before = await state(page);
  await swipe(page, -180, 0);
  expect(await state(page)).toEqual(before);
  await page.locator(".reader-progress-row [data-action=next]").click();
  await expect
    .poll(async () => (await state(page)).start)
    .toBeGreaterThan(before.start);
  await page.locator("[data-action=toggle-flow]").click();
  await menu(page, "controls");
  await page
    .getByRole("searchbox", { name: "Find a setting" })
    .fill("disable vertical");
  await page.locator("[data-setting=disableVerticalScroll]").check();
  await page.locator(".close-modal").click();
  await page.waitForTimeout(500);
  const locked = await state(page);
  await swipe(page, 0, -160);
  expect(await state(page)).toEqual(locked);
  await menu(page, "controls");
  await page
    .getByRole("searchbox", { name: "Find a setting" })
    .fill("disable vertical");
  await page.locator("[data-setting=disableVerticalScroll]").uncheck();
  await page.locator(".close-modal").click();
  await swipe(page, 0, -160);
  await expect
    .poll(async () => (await state(page)).start)
    .toBeGreaterThan(locked.start + 50);
});

test("background gallery, album import and downloaded images persist offline", async ({
  page,
}) => {
  await open(page);
  await page.locator("[data-action=appearance]").click();
  await page.locator("#custom-background").click();
  await expect(page.locator("[data-background]")).toHaveCount(15);
  await page.locator("[data-background=parchment]").click();
  await expect(page.locator("#book-viewport")).toHaveCSS(
    "background-image",
    /data:image\/svg/,
  );
  await page.screenshot({
    path: "docs/screenshots/reading-1.7.0/backgrounds.png",
  });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"><rect width="30" height="40" fill="#aabbcc"/></svg>';
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#background-album").click();
  await (
    await chooser
  ).setFiles({
    name: "paper.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svg),
  });
  await expect(page.locator("#background-message")).toHaveText(
    "Your image is saved offline.",
  );
  await expect(page.locator("#book-viewport")).toHaveCSS(
    "background-image",
    /data:image\/jpeg/,
  );
  await page.route("https://example.test/paper.svg", (r) =>
    r.fulfill({
      contentType: "image/svg+xml",
      body: svg,
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.locator("#background-download").click();
  await page.locator("#background-url").fill("https://example.test/paper.svg");
  await page.locator("#background-url-form button").click();
  await expect(page.locator("#background-message")).toHaveText(
    "Your image is saved offline.",
  );
  const download = page.waitForEvent("download");
  await page.locator("#background-save").click();
  expect((await download).suggestedFilename()).toBe("Books-background.jpg");
  await page.locator(".close-modal").click();
  await page.locator("[data-action=exit]").click();
  await page.reload();
  await page.locator("[data-tab=library]").click();
  await page.locator(".book-cover-button").click();
  await expect(page.locator("#book-viewport")).toHaveCSS(
    "background-image",
    /data:image\/jpeg/,
  );
});

test("custom hardware mappings persist and do not act behind a dialog", async ({
  page,
}) => {
  await open(page);
  await menu(page, "controls");
  await page
    .getByRole("searchbox", { name: "Find a setting" })
    .fill("hardware");
  await page.locator("#hardware-code").fill("131");
  await page.locator("#add-key").click();
  await page.locator('[data-hardware="131"]').selectOption("font-up");
  await page.locator(".close-modal").click();
  const size = () =>
    page.evaluate(() => {
      const d = (
        document.querySelector("foliate-view") as any
      ).renderer.getContents()[0].doc;
      return parseFloat(d.defaultView.getComputedStyle(d.body).fontSize);
    });
  const before = await size();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("native:key", { detail: "custom:131" }),
    ),
  );
  await expect.poll(size).toBe(before + 1);
  await menu(page, "controls");
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("native:key", { detail: "custom:131" }),
    ),
  );
  expect(await size()).toBe(before + 1);
  await page
    .getByRole("searchbox", { name: "Find a setting" })
    .fill("hardware");
  await expect(page.locator('[data-hardware="131"]')).toHaveValue("font-up");
});

for (const animation of ["vertical", "zoom"])
  test(`${animation} page animation changes pages and offers a visual preset`, async ({
    page,
  }) => {
    await open(page);
    await page.locator("[data-action=appearance]").click();
    await page.locator("[data-setting=flow]").selectOption("paginated");
    await expect(page.locator("[data-animation]")).toHaveCount(8);
    await page.locator(`[data-animation=${animation}]`).click();
    await expect(page.locator("[data-setting=animation]")).toHaveValue(
      animation,
    );
    await page.locator(".close-modal").click();
    const before = await state(page);
    await page.locator(".reader-progress-row [data-action=next]").click();
    await expect
      .poll(async () => (await state(page)).start)
      .toBeGreaterThan(before.start);
  });
