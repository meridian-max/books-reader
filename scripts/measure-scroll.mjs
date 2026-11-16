import { connect } from "./android-cdp.mjs";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
const label = process.argv[2] ?? "current";
const adb =
  "/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb";
const c = await connect();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await c.poll(
    () => !!document.body && !!document.querySelector(".main-appbar"),
  );
  if (await c.evaluate(() => !!document.querySelector(".close-modal")))
    await c.click(".close-modal");
  if (!(await c.evaluate(() => document.body.classList.contains("reading")))) {
    await c.click("[data-nav=library]");
    await c.poll(() => !!document.querySelector(".book-title"));
    await c.evaluate(() =>
      [...document.querySelectorAll(".book-title")]
        .find((x) => x.textContent.includes("Alice's Adventures"))
        ?.click(),
    );
  }
  await c.poll(
    () =>
      !!document.querySelector("foliate-view")?.renderer?.getContents().length,
  );
  await c.click("[data-action=appearance]");
  await c.evaluate(() => {
    const s = document.querySelector("[data-setting=flow]");
    s.value = "scrolled";
    s.dispatchEvent(new Event("input", { bubbles: true }));
    s.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await c.click(".close-modal");
  await c.poll(() => document.querySelector("foliate-view").renderer.scrolled);
  await c.evaluate(() =>
    (() => {
      const v = document.querySelector("foliate-view");
      return v.goTo(v.book.toc.find((x) => /CHAPTER I\./.test(x.label)).href);
    })(),
  );
  await sleep(800);
  const listeners = {};
  for (const [name, expression] of Object.entries({
    host: "document.querySelector('foliate-view').renderer",
    bookDocument:
      "document.querySelector('foliate-view').renderer.getContents()[0].doc",
  })) {
    const { result } = await c.send("Runtime.evaluate", { expression });
    const value = await c.send("DOMDebugger.getEventListeners", {
      objectId: result.objectId,
    });
    listeners[name] = value.listeners
      .filter((x) => ["touchstart", "touchmove"].includes(x.type))
      .map((x) => ({ type: x.type, passive: x.passive }));
  }
  await c.evaluate(() => {
    const r = document.querySelector("foliate-view").renderer;
    const p = (window.__scrollProbe = {
      start: r.start,
      gaps: [],
      longTasks: [],
      bodyWalks: 0,
      started: performance.now(),
      done: false,
    });
    const old = Document.prototype.createTreeWalker;
    Document.prototype.createTreeWalker = function (root, ...args) {
      if (root === document.body) p.bodyWalks++;
      return old.call(this, root, ...args);
    };
    p.restore = () => (Document.prototype.createTreeWalker = old);
    p.observer = new PerformanceObserver((list) =>
      p.longTasks.push(...list.getEntries().map((x) => x.duration)),
    );
    p.observer.observe({ type: "longtask", buffered: false });
    let last = performance.now();
    const frame = (now) => {
      p.gaps.push(now - last);
      last = now;
      if (!p.done) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  for (let i = 0; i < 6; i++) {
    execFileSync(adb, [
      "-s",
      "emulator-5570",
      "shell",
      "input",
      "swipe",
      "540",
      "1390",
      "540",
      "580",
      "420",
    ]);
    await sleep(80);
  }
  await sleep(350);
  const scroll = await c.evaluate(() => {
    const p = window.__scrollProbe;
    p.done = true;
    p.observer.disconnect();
    p.restore();
    const gaps = p.gaps.slice(1).sort((a, b) => a - b),
      r = document.querySelector("foliate-view").renderer;
    return {
      durationMs: performance.now() - p.started,
      frames: gaps.length,
      p95FrameMs: gaps[Math.floor(gaps.length * 0.95)],
      maxFrameMs: Math.max(...gaps),
      framesOver34ms: gaps.filter((x) => x > 34).length,
      longTasks: p.longTasks,
      bodyWalks: p.bodyWalks,
      scrolledPixels: r.start - p.start,
    };
  });
  await c.evaluate(() =>
    (() => {
      const v = document.querySelector("foliate-view");
      return v.goTo(v.book.toc.find((x) => /CHAPTER I\./.test(x.label)).href);
    })(),
  );
  await c.click("[data-action=more]");
  await c.click("[data-reader-option=autoscroll]");
  await c.evaluate(() => {
    for (const [key, value] of [
      ["autoMode", "pixel"],
      ["autoSpeed", "120"],
    ]) {
      const el = document.querySelector("[data-setting=" + key + "]");
      el.value = value;
      el.dispatchEvent(
        new Event(key === "autoMode" ? "change" : "input", { bubbles: true }),
      );
    }
  });
  await sleep(800);
  await c.click("#start-auto");
  await sleep(350);
  const autoBefore = await c.evaluate(() => {
    const r=document.querySelector('foliate-view').renderer;
    const p=window.__autoProbe={previous:r.start,steps:[],done:false};
    const frame=()=>{const next=r.start;p.steps.push(next-p.previous);p.previous=next;if(!p.done)requestAnimationFrame(frame);};
    requestAnimationFrame(frame);
    return r.start;
  });
  await sleep(2000);
  const autoAfter = await c.evaluate(
    () => document.querySelector("foliate-view").renderer.start,
  );
  await c.click("[data-auto-stop]");
  const autoMaxFramePixels=await c.evaluate(()=>{window.__autoProbe.done=true;return Math.max(...window.__autoProbe.steps);});
  if((label==='after' || label.startsWith('1.1.')) && (autoAfter-autoBefore < 200 || autoAfter-autoBefore > 280 || autoMaxFramePixels > 12)) throw Error('Auto-scroll is not steady: '+JSON.stringify({distance:autoAfter-autoBefore,autoMaxFramePixels}));
  const report = {
    label,
    at: new Date().toISOString(),
    device: "Android 15 / API 35 emulator",
    listeners,
    scroll,
    autoScrollPixelsIn2Seconds: autoAfter - autoBefore,
    autoMaxFramePixels,
  };
  await writeFile(
    "docs/scroll-performance-" + label + ".json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  c.close();
}
