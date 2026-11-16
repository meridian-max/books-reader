import assert from "node:assert/strict";
import { connect } from "./android-cdp.mjs";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
const version = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
const adb =
  "/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb";
const mode = process.argv[2] ?? "scrolled";
const c = await connect();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shell = (...args) =>
  execFileSync(adb, ["-s", "emulator-5570", "shell", ...args], {
    encoding: "utf8",
  });
try {
  if (await c.evaluate(() => !!document.querySelector(".close-modal")))
    await c.click(".close-modal");
  await c.click('[data-action=appearance]');
  await c.evaluate((mode) => {
    for (const [key, value] of [['flow', mode], ['fontSize', '20']]) {
      const el = document.querySelector('[data-setting='+key+']');
      el.value = value; el.dispatchEvent(new Event('input', {bubbles:true}));
    }
  }, mode);
  await c.click('.close-modal');
  await c.native("immersive", { value: false });
  await sleep(200);
  await c.evaluate(() => {
    const v = document.querySelector("foliate-view");
    return v.goTo(v.book.toc.find((x) => /CHAPTER I\./.test(x.label)).href);
  });
  await sleep(500);
  await c.evaluate(() => document.querySelector("foliate-view").renderer.getContents()[0].doc.getSelection()?.removeAllRanges());
  const point = await c.evaluate(() => {
    const doc = document
      .querySelector("foliate-view")
      .renderer.getContents()[0].doc;
    const p = [...doc.querySelectorAll("p")].find((p) =>
      p.textContent.trim().startsWith("Alice was"),
    );
    const walker = doc.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let text;
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.includes("Alice")) {
        text = walker.currentNode;
        break;
      }
    }
    const at = text.textContent.indexOf("Alice"),
      range = doc.createRange();
    range.setStart(text, at);
    range.setEnd(text, at + 5);
    const rect = range.getBoundingClientRect(),
      frame = doc.defaultView.frameElement.getBoundingClientRect();
    return {
      x: rect.x + rect.width / 2 + frame.x,
      y: rect.y + rect.height / 2 + frame.y,
      scale: 1080 / innerWidth,
    };
  });
  shell("uiautomator", "dump", "/sdcard/books-selection-ui.xml");
  const xml = shell("cat", "/sdcard/books-selection-ui.xml");
  const bounds = xml.match(
    /class="android.webkit.WebView"[^>]*bounds="\[\d+,(\d+)\]/,
  );
  assert.ok(bounds, "App WebView must be visible before the touch test");
  const inset = Number(bounds[1]);
  const x = Math.round(point.x * point.scale),
    y = inset + Math.round(point.y * point.scale);
  console.log("Long press target", point, { x, y });
  shell("input", "swipe", String(x), String(y), String(x), String(y), "1200");
  await c.screenshot("docs/screenshots/android-selection-attempt.png");
  const firstQuote = await c.poll(() =>
    document
      .querySelector("foliate-view")
      .renderer.getContents()[0]
      .doc.defaultView.getSelection()
      ?.toString(),
  );
  assert.equal(firstQuote.trim(), "Alice", "Long-press must select the word under the finger");
  const handle = await c.evaluate(() => {
    const doc = document
      .querySelector("foliate-view")
      .renderer.getContents()[0].doc;
    const selected = doc.defaultView.getSelection().getRangeAt(0);
    const frame = doc.defaultView.frameElement.getBoundingClientRect(),
      rect = selected.getBoundingClientRect();
    const expanded = selected.cloneRange();
    expanded.setEnd(
      selected.startContainer,
      Math.min(selected.startContainer.length, selected.startOffset + 19),
    );
    const target =
      expanded.getClientRects()[expanded.getClientRects().length - 1];
    return {
      x: rect.right + frame.x + 11,
      y: rect.bottom + frame.y + 16,
      toX: target.right + frame.x + 11,
      toY: target.bottom + frame.y + 16,
      scale: 1080 / innerWidth,
    };
  });
  shell(
    "input",
    "swipe",
    String(Math.round(handle.x * handle.scale)),
    String(inset + Math.round(handle.y * handle.scale)),
    String(Math.round(handle.toX * handle.scale)),
    String(inset + Math.round(handle.toY * handle.scale)),
    "700",
  );
  const quote = await c.poll(() => {
    const text = document
      .querySelector("foliate-view")
      .renderer.getContents()[0]
      .doc.defaultView.getSelection()
      ?.toString();
    return text?.length > 5 ? text : false;
  });

  await c.poll(() => !document.querySelector("#selection-tools").hidden);
  await c.screenshot(`docs/screenshots/android-native-selection-${mode}.png`);
  await writeFile(`docs/screenshots/android-native-selection-full-${mode}-${version}.png`, execFileSync(adb, ["-s", "emulator-5570", "exec-out", "screencap", "-p"]));
  const before = await c.evaluate(async () => {
    const d = await new Promise((res) => {
      const r = indexedDB.open("books-reader");
      r.onsuccess = () => res(r.result);
    });
    return new Promise((res) => {
      const r = d.transaction("marks").objectStore("marks").getAll();
      r.onsuccess = () => {
        d.close();
        res(r.result.filter((x) => !x.deleted).length);
      };
    });
  });
  await c.click('[data-selection="palette"]');
  const color = await c.evaluate(() => {
    const r = document.querySelector("[data-color]").getBoundingClientRect();
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      scale: 1080 / innerWidth,
    };
  });
  shell(
    "input",
    "tap",
    String(Math.round(color.x * color.scale)),
    String(inset + Math.round(color.y * color.scale)),
  );
  await c.poll(() =>
    document.querySelector("#toast").textContent.includes("highlighted"),
  );
  const saved = await c.evaluate(async () => {
    const d = await new Promise((res) => {
      const r = indexedDB.open("books-reader");
      r.onsuccess = () => res(r.result);
    });
    return new Promise((res) => {
      const r = d.transaction("marks").objectStore("marks").getAll();
      r.onsuccess = () => {
        d.close();
        res(
          r.result
            .filter((x) => !x.deleted)
            .map((x) => ({
              quote: x.quote,
              location: x.location,
              style: x.style,
            })),
        );
      };
    });
  });
  assert.ok(
    saved.some((x) => x.quote.trim() === quote.trim()),
    "Native selected word was not persisted",
  );
  assert.ok(saved.length >= before);
  await c.screenshot(`docs/screenshots/android-native-highlight-${mode}.png`);
  const report = {
    at: new Date().toISOString(),
    version,
    status: "passed",
    mode,
    flow: "Actual Android 1200ms long-press, native handle drag extends selected text, real tap on color control, saved quote verified in IndexedDB",
    firstQuote,
    handle,
    quote,
    marks: saved.length,
  };
  await writeFile(
    `docs/android-selection-${mode}-results.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(report);
} finally {
  await c.native("immersive", { value: false }).catch(() => {});
  c.close();
}
