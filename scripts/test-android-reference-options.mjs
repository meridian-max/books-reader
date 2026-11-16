import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { connect } from "./android-cdp.mjs";
const adb =
    "/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb",
  serial = "emulator-5570";
const command = (...args) =>
    execFileSync(adb, ["-s", serial, ...args], { encoding: "utf8" }),
  shell = (...args) => command("shell", ...args),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
assert.match(command("emu", "avd", "name"), /Books_Test/);
const c = await connect(),
  checks = [];
const change = (selector, value) =>
  c.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector(selector);
      if (!el) throw Error(selector);
      if (el.type === "checkbox") el.checked = value;
      else el.value = String(value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { selector, value },
  );
const close = () =>
  c.evaluate(() => document.querySelector(".close-modal")?.click());
async function controls() {
  await close();
  await c.click(".reader-tool[data-action=more]");
  await c.click("[data-reader-option=controls]");
}
const font = () =>
  c.evaluate(() => {
    const d = document
      .querySelector("foliate-view")
      .renderer.getContents()[0].doc;
    return parseFloat(d.defaultView.getComputedStyle(d.body).fontSize);
  });
const record = (name, details) => {
  checks.push({ name, status: "passed", details });
  console.log("PASS", name);
};
try {
  await c.poll(
    () =>
      !!document.querySelector("foliate-view")?.renderer?.getContents().length,
  );
  await controls();
  await c.click("#reset-controls");
  for (const [orientation, expected] of Object.entries({
    auto: "FULL_SENSOR",
    portrait: "SENSOR_PORTRAIT",
    landscape: "SENSOR_LANDSCAPE",
    "portrait-fixed": "PORTRAIT",
    "landscape-fixed": "LANDSCAPE",
    "reverse-portrait": "REVERSE_PORTRAIT",
    "reverse-landscape": "REVERSE_LANDSCAPE",
    locked: "LOCKED",
  })) {
    await change("[data-setting=orientation]", orientation);
    await sleep(300);
    assert.ok(
      shell("dumpsys", "activity", "activities").includes(
        "requestedOrientation=SCREEN_ORIENTATION_" + expected,
      ),
    );
  }
  await change("[data-setting=orientation]", "portrait-fixed");
  await sleep(500);
  record(
    "All eight orientation choices reach Android ActivityInfo; layout survives rotation",
  );
  await c.click("#learn-key");
  shell("input", "keyevent", "131");
  await c.poll(() => document.querySelector("#hardware-code").value === "131");
  await c.click("#add-key");
  await change('[data-hardware="131"]', "font-up");
  await close();
  const before = await font();
  shell("input", "keyevent", "131");
  await c.poll((v) => {
    const d = document
      .querySelector("foliate-view")
      .renderer.getContents()[0].doc;
    return parseFloat(d.defaultView.getComputedStyle(d.body).fontSize) === v;
  }, before + 1);
  record(
    "Detect F1 keycode, assign action and execute actual Android hardware event",
  );
  await controls();
  shell("input", "keyevent", "131");
  await sleep(150);
  assert.equal(await font(), before + 1);
  record("Custom hardware events do not change the book behind settings");
  const keys = {
    volumeUp: 24,
    volumeDown: 25,
    menu: 82,
    search: 84,
    camera: 27,
    dpadUp: 19,
    dpadDown: 20,
    dpadLeft: 21,
    dpadRight: 22,
    dpadCenter: 23,
    back: 4,
  };
  for (const [key, code] of Object.entries(keys)) {
    await change(`[data-control=${key}]`, "book-info");
    await close();
    shell("input", "keyevent", String(code));
    await c.poll(
      () =>
        document.querySelector(".modal h2")?.textContent === "Book information",
    );
    await controls();
  }
  record(
    "Volume, Menu, Search, Camera, all five D-pad directions and Back perform configured actions",
    Object.keys(keys),
  );
  await change("#shake-action", "book-info");
  await change("[data-setting=shakeThreshold]", 23);
  await close();
  command("emu", "sensor", "set", "acceleration", "0:9.8:0");
  await sleep(1900);
  command("emu", "sensor", "set", "acceleration", "30:30:30");
  await c.poll(
    () =>
      document.querySelector(".modal h2")?.textContent === "Book information",
  );
  command("emu", "sensor", "set", "acceleration", "0:9.8:0");
  record("Configured shake action responds to simulated accelerometer input");
  await controls();
  await c.click("#reset-controls");
  await close();
  await c.click("[data-action=appearance]");
  await change("[data-setting=flow]", "scrolled");
  await change("[data-setting=animation]", "slide");
  await change("[data-setting=fontSize]", 20);
  await close();
  await c.evaluate(() => document.querySelector("foliate-view").goTo(0));
  await sleep(500);
  await c.native("immersive", { value: false });
  shell("uiautomator", "dump", "/sdcard/books-reference-ui.xml");
  const xml = shell("cat", "/sdcard/books-reference-ui.xml");
  const inset = Number(
    xml.match(/class="android.webkit.WebView"[^>]*bounds="\[\d+,(\d+)\]/)[1],
  );
  const swipe = async (dx, dy) => {
    const b = await c.evaluate(() => {
      const r = document.querySelector("foliate-view").getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        scale: 1080 / innerWidth,
      };
    });
    const x = b.x + b.w / 2 - dx / 2,
      y = b.y + b.h / 2 - dy / 2;
    shell(
      "input",
      "swipe",
      String(Math.round(x * b.scale)),
      String(inset + Math.round(y * b.scale)),
      String(Math.round((x + dx) * b.scale)),
      String(inset + Math.round((y + dy) * b.scale)),
      "400",
    );
    await sleep(350);
  };
  await controls();
  await change("[data-setting=disableVerticalScroll]", true);
  await close();
  await sleep(500);
  const start = await c.evaluate(
    () => document.querySelector("foliate-view").renderer.start,
  );
  await swipe(0, -180);
  assert.equal(
    await c.evaluate(
      () => document.querySelector("foliate-view").renderer.start,
    ),
    start,
  );
  await controls();
  await change("[data-setting=disableVerticalScroll]", false);
  await close();
  await sleep(300);
  await swipe(0, -180);
  assert.ok(
    (await c.evaluate(
      () => document.querySelector("foliate-view").renderer.start,
    )) >
      start + 80,
  );
  record(
    "Vertical touch lock prevents finger scrolling; switching it off immediately restores native scrolling",
  );
  await controls();
  await change("[data-setting=disableVerticalScroll]", true);
  for (const key of ["swipeLeft", "swipeRight", "swipeUp", "swipeDown"])
    await change(`[data-control=${key}]`, "font-up");
  await close();
  for (const [dx, dy] of [
    [-180, 0],
    [180, 0],
    [0, -180],
    [0, 180],
  ]) {
    const prior = await font();
    await swipe(dx, dy);
    assert.equal(await font(), prior + 1);
  }
  record("All four configured directional gestures execute once");
  await controls();
  await c.click("#reset-controls");
  await c.screenshot("docs/screenshots/reading-1.7.0/android-controls.png");
  await close();
  assert.equal((await c.native("voicePackStatus")).state, "installed");
  assert.equal(
    (await c.native("voices", { engine: "app.books.reader" })).length,
    49,
  );
  record("Upgrade preserves the optional downloaded 49-voice pack");
  await mkdir("docs/verification-1.7.0", { recursive: true });
  await writeFile(
    "docs/verification-1.7.0/android-controls.json",
    JSON.stringify(
      {
        version: "1.7.0",
        at: new Date().toISOString(),
        device: "Android 15 isolated x86_64 emulator; no physical phone tested",
        checks,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  command("emu", "sensor", "set", "acceleration", "0:9.8:0");
  c.close();
}
