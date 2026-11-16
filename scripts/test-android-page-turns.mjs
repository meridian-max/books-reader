import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { connect } from "./android-cdp.mjs";

const version = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
const adb =
  "/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb";
const shell = (...args) =>
  execFileSync(adb, ["-s", "emulator-5570", "shell", ...args], {
    encoding: "utf8",
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const c = await connect();
try {
  await c.poll(() => !!document.querySelector('[data-action="mobile-menu"]'));
  await c.evaluate(() => document.querySelector(".close-modal")?.click());
  if (await c.evaluate(() => document.body.classList.contains("reading"))) {
    await c.click('[data-action="exit"]');
    await c.poll(() => !document.body.classList.contains("reading"));
  }
  await c.click('[data-action="mobile-menu"]');
  await c.click('[data-nav="home"]');
  await c.screenshot(`docs/screenshots/android-home-${version}.png`);
  await c.click('[data-action="mobile-menu"]');
  await c.click('[data-nav="library"]');
  await c.evaluate(() =>
    [...document.querySelectorAll(".book-title")]
      .find((x) => x.textContent.includes("Alice's Adventures"))
      ?.click(),
  );
  await c.poll(
    () =>
      document.querySelector("foliate-view")?.renderer?.getContents().length,
  );
  await c.click('[data-action="appearance"]');
  await c.evaluate(() => {
    for (const [key, value] of [
      ["flow", "paginated"],
      ["animation", "slide"],
      ["fontSize", "20"],
      ["animationSpeed", "200"],
    ]) {
      const el = document.querySelector(`[data-setting="${key}"]`);
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await c.click(".close-modal");
  await c.native("immersive", { value: false });
  await c.evaluate(() => {
    const view = document.querySelector("foliate-view");
    return view.goTo(
      view.book.toc.find((x) => /CHAPTER I\./.test(x.label)).href,
    );
  });
  await sleep(600);
  const before = await c.evaluate(() => {
    const renderer = document.querySelector("foliate-view").renderer;
    const probe = (window.__turnProbe = {
      captures: 0,
      gaps: [],
      keys: [],
      done: false,
    });
    probe.keyListener = (event) => probe.keys.push(event.detail);
    window.addEventListener("native:key", probe.keyListener);
    const original = window.BooksNative.request;
    probe.restore = () => {
      window.BooksNative.request = original;
      window.removeEventListener("native:key", probe.keyListener);
    };
    window.BooksNative.request = (...args) => {
      if (args[1] === "capture") probe.captures++;
      return original(...args);
    };
    let last = performance.now();
    const frame = (now) => {
      probe.gaps.push(now - last);
      last = now;
      if (!probe.done) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return {
      start: renderer.start,
      size: renderer.size,
      section: renderer.getContents()[0].index,
    };
  });
  shell("input", "swipe", "850", "900", "240", "900", "380");
  await sleep(400);
  const afterSwipe = await c.evaluate(() => {
    const r = document.querySelector("foliate-view").renderer;
    return { start: r.start, section: r.getContents()[0].index };
  });
  assert.equal(afterSwipe.section, before.section);
  assert.ok(
    Math.abs(afterSwipe.start - before.start - before.size) < 2,
    JSON.stringify({ before, afterSwipe }),
  );
  shell("input", "keyevent", "KEYCODE_DPAD_RIGHT");
  await c.poll(
    ({ start, size }) =>
      Math.abs(
        document.querySelector("foliate-view").renderer.start - start - size,
      ) < 2,
    { start: afterSwipe.start, size: before.size },
    3000,
  );
  const afterKey = await c.evaluate(
    () => document.querySelector("foliate-view").renderer.start,
  );
  assert.ok(
    Math.abs(afterKey - afterSwipe.start - before.size) < 2,
    JSON.stringify({ afterKey, afterSwipe, before }),
  );
  const probe = await c.evaluate(() => {
    const p = window.__turnProbe;
    p.done = true;
    p.restore();
    const gaps = p.gaps.slice(1).sort((a, b) => a - b);
    return {
      captures: p.captures,
      keys: p.keys,
      frames: gaps.length,
      p95FrameMs: gaps[Math.floor(gaps.length * 0.95)],
      maxFrameMs: Math.max(...gaps),
      framesOver34ms: gaps.filter((x) => x > 34).length,
    };
  });
  assert.equal(
    probe.captures,
    0,
    "Slide must not capture or encode a screenshot",
  );
  await c.screenshot(`docs/screenshots/android-page-turn-${version}.png`);
  const report = {
    at: new Date().toISOString(),
    version,
    status: "passed",
    device: "Isolated Android 15 API 35 emulator; 60 Hz",
    before,
    afterSwipe,
    afterKey,
    probe,
    boundary:
      "Short emulator sample; not a physical-device or universal smoothness guarantee",
  };
  await writeFile(
    `docs/android-page-turns-${version}-results.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const state = await c.evaluate(() => {
    const view = document.querySelector("foliate-view"), r = view?.renderer;
    return { keys: window.__turnProbe?.keys, start: r?.start, size: r?.size, flow: r?.getAttribute("flow"), location: view?.lastLocation?.cfi, selection: r?.getContents()[0]?.doc.getSelection()?.toString() };
  }).catch(() => null);
  console.error("Page-turn failure state:", state);
  throw error;
} finally {
  await c.evaluate(() => { const p = window.__turnProbe; if (p) { p.done = true; p.restore?.(); } }).catch(() => {});
  c.close();
}
