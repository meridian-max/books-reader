import { connect } from "./android-cdp.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const adb =
  "/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb";
const c = await connect();
const results = [];
async function check(name, fn) {
  try {
    const evidence = await fn();
    results.push({ name, status: "passed", evidence });
    console.log("PASS", name, evidence ?? "");
  } catch (e) {
    results.push({ name, status: "failed", error: e.message });
    console.error("FAIL", name, e.message);
    await c.evaluate(() => document.querySelector(".close-modal")?.click());
    if (await c.evaluate(() => document.body.classList.contains("reading"))) {
      await c.click("[data-action=exit]");
      await c.poll(() => !document.body.classList.contains("reading"));
    }
  }
}
await mkdir("docs/screenshots", { recursive: true });
await c.send("Page.reload");
await c.poll(() => !!document.querySelector("[data-action=mobile-menu]"));
await c.click("[data-action=mobile-menu]");
await c.click("[data-nav=library]");
await check("origin and main-frame native bridge", async () => {
  assert.equal(
    await c.evaluate(() => location.origin),
    "https://appassets.androidplatform.net",
  );
  assert.equal(await c.evaluate(() => !!window.BooksNative), true);
  return "AssetLoader HTTPS origin; BooksBridge available to main frame";
});
await check(
  "native CHM decode, import, chapter links and rendering",
  async () => {
    const buffer = await readFile("tests/fixtures/reading.chm");
    await c.evaluate(
      ({ name, base64 }) => {
        const f = new File(
          [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
          name,
        );
        const dt = new DataTransfer();
        dt.items.add(f);
        const input = document.querySelector("#file-input");
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      { name: "reading.chm", base64: buffer.toString("base64") },
    );
    await c.poll(() =>
      [...document.querySelectorAll(".book-title")].some(
        (x) => x.textContent === "Books CHM fixture",
      ),
    );
    await c.evaluate(() =>
      [...document.querySelectorAll(".book-title")]
        .find((x) => x.textContent === "Books CHM fixture")
        .click(),
    );
    await c.poll(
      () =>
        !!document.querySelector("foliate-view")?.renderer?.getContents()[0]
          ?.doc.body,
    );
    await c.click(".reader-toolbar [data-action=contents]");
    await c.click('.toc-item[data-href="index.html"]');
    await c.poll(() => {
      const v = document.querySelector("foliate-view");
      return v?.renderer
        ?.getContents()[0]
        ?.doc.body?.textContent.includes("real CHM document");
    });
    await c.click(".reader-toolbar [data-action=contents]");
    await c.evaluate(() =>
      [...document.querySelectorAll(".toc-item")]
        .find((x) => x.textContent.includes("second chapter"))
        .click(),
    );
    await c.poll(() =>
      document
        .querySelector("foliate-view")
        ?.renderer?.getContents()[0]
        ?.doc.body?.textContent.includes("document links work"),
    );
    await c.screenshot("docs/screenshots/android-chm.png");
    await c.click("[data-action=exit]");
    await c.poll(() => !document.body.classList.contains("reading"));
    return "Real ITSF container decoded by Java; second chapter selected through table of contents";
  },
);
await check("native EPUB import and offline shelf", async () => {
  await c.click("[data-action=app-menu]");
  await c.click("[data-menu-action=sample-books]");
  await c.poll(() => document.querySelectorAll(".book-card").length >= 5);
  await c.screenshot("docs/screenshots/android-shelf.png");
  await c.click("[data-action=mobile-menu]");
  await c.screenshot("docs/screenshots/android-drawer.png");
  await c.click("[data-action=close-drawer]");
  return await c.evaluate(() =>
    [...document.querySelectorAll(".book-title")].map((x) => x.textContent),
  );
});
await check("real volume-down event advances reading location", async () => {
  await c.evaluate(() =>
    [...document.querySelectorAll(".book-title")]
      .find((x) => x.textContent.includes("Alice"))
      .click(),
  );
  await c.poll(
    () => !!document.querySelector("foliate-view")?.lastLocation?.cfi,
  );
  const before = await c.evaluate(
    () => document.querySelector("foliate-view").lastLocation.cfi,
  );
  execFileSync(adb, [
    "-s",
    "emulator-5570",
    "shell",
    "input",
    "keyevent",
    "25",
  ]);
  await c.poll(
    (before) =>
      document.querySelector("foliate-view")?.lastLocation?.cfi !== before,
    before,
  );
  await c.click(".reader-toolbar [data-action=bookmark]");
  await c.screenshot("docs/screenshots/android-reader.png");
  return {
    before,
    after: await c.evaluate(
      () => document.querySelector("foliate-view").lastLocation.cfi,
    ),
  };
});
await check("native speech voices and service playback events", async () => {
  const voices = await c.native("voices");
  await c.evaluate(() => {
    window.__speechTest = [];
    window.addEventListener("native:speech", (e) =>
      window.__speechTest.push(e.detail),
    );
  });
  await c.click(".reader-toolbar [data-action=speech]");
  await c.poll(
    () =>
      document.querySelector("#start-speech") &&
      !document.querySelector("#start-speech").disabled,
  );
  await c.click("#start-speech");
  await c.poll(() => !!document.querySelector(".tts-now-playing"));
  await c.poll(
    () => window.__speechTest.some((x) => x.state === "playing"),
    undefined,
    20000,
  );
  await c.click("[data-action=speech-pause]");
  await c.poll(() => window.__speechTest.some((x) => x.state === "paused"));
  await c.screenshot("docs/screenshots/android-speech.png");
  const events = await c.evaluate(() => window.__speechTest);
  await c.click("[data-action=speech-stop]");
  return {
    voiceCount: voices.length,
    offlineVoices: voices.filter((v) => !v.network).length,
    events: events.slice(0, 6),
  };
});
await check("scoped Android document operations", async () => {
  const root = await c.native("getFolder");
  assert.ok(
    root.includes("BooksTest"),
    "Select the BooksTest fixture folder through the Android picker first.",
  );
  const files = await c.native("listFiles", { uri: root }),
    source = files.find((x) => x.name === "reading.chm");
  assert.ok(source);
  const folder = await c.native("makeFolder", {
    uri: root,
    name: "OperationsTest",
  });
  const copied = await c.native("copyFile", {
    uri: source.uri,
    destination: folder,
  });
  const renamed = await c.native("renameFile", {
    uri: copied,
    name: "renamed.chm",
  });
  assert.equal(
    (await c.native("listFiles", { uri: folder }))[0].name,
    "renamed.chm",
  );
  const moved = await c.native("moveFile", {
    uri: renamed,
    parent: folder,
    destination: root,
  });
  await c.native("deleteFile", { uri: moved });
  await c.native("deleteFile", { uri: folder });
  return "System picker grant retained; create/copy/rename/move/delete completed on real DocumentsProvider files";
});
await check(
  "native page-fold transition captures actual page content",
  async () => {
    if (
      !(await c.evaluate(() => document.body.classList.contains("reading")))
    ) {
      await c.click("[data-action=mobile-menu]");
      await c.click("[data-nav=library]");
      await c.evaluate(() =>
        [...document.querySelectorAll(".book-title")]
          .find((x) => x.textContent.includes("Alice"))
          .click(),
      );
    }
    await c.click("[data-action=appearance]");
    await c.evaluate(() => {
      const flow = document.querySelector("[data-setting=flow]");
      flow.value = "paginated";
      flow.dispatchEvent(new Event("input"));
      const select = document.querySelector("[data-setting=animation]");
      select.value = "curl";
      select.dispatchEvent(new Event("input"));
      const speed = document.querySelector("[data-setting=animationSpeed]");
      speed.value = "1200";
      speed.dispatchEvent(new Event("input"));
    });
    await c.click(".close-modal");
    await c.click(".reader-toolbar [data-action=contents]");
    await c.evaluate(() =>
      [...document.querySelectorAll(".toc-item")]
        .find((x) => x.textContent.includes("Down the Rabbit"))
        .click(),
    );
    await c.poll(() => {
      const doc = document
        .querySelector("foliate-view")
        ?.renderer?.getContents()[0]?.doc;
      return (
        doc?.body?.textContent.includes("Alice was beginning") &&
        !doc.querySelector("parsererror")
      );
    });
    const bounds = await c.evaluate(() => {
      const r = document
        .querySelector("#book-viewport")
        .getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        viewportWidth: innerWidth,
      };
    });
    const bitmap = await c.native("capture", bounds);
    const colors = await c.evaluate(async (bitmap) => {
      const img = new Image();
      img.src = bitmap;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(img, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 16)
        colors.add(data[i] + "," + data[i + 1] + "," + data[i + 2]);
      return colors.size;
    }, bitmap);
    assert.ok(
      colors > 12,
      "Native page bitmap must contain actual rendered text, not a blank surface.",
    );
    const before = await c.evaluate(
      () => document.querySelector("foliate-view").lastLocation.cfi,
    );
    execFileSync(adb, [
      "-s",
      "emulator-5570",
      "shell",
      "input",
      "keyevent",
      "25",
    ]);
    await c.poll(
      () =>
        Number(
          document.querySelector(".page-transition svg")?.dataset.progress,
        ) > 0.12,
    );
    await c.screenshot("docs/screenshots/android-page-fold.png");
    await c.poll(() => !document.querySelector(".page-transition"));
    assert.notEqual(
      await c.evaluate(
        () => document.querySelector("foliate-view").lastLocation.cfi,
      ),
      before,
    );
    return "Native WebView bitmap folded with clipped and reflected paper surfaces; next location reached";
  },
);
await check("WebDAV sync and full binary cloud backup/restore", async () => {
  const storage = new Map(),
    requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const b of req) chunks.push(b);
    const body = Buffer.concat(chunks);
    requests.push({ method: req.method, path: req.url, bytes: body.length });
    if (req.method === "PUT") {
      storage.set(req.url, body);
      res.writeHead(204);
      res.end();
    } else if (storage.has(req.url)) {
      res.writeHead(200, {
        "Content-Type": req.url.endsWith(".books")
          ? "application/zip"
          : "application/json",
      });
      res.end(storage.get(req.url));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(8766, "127.0.0.1", r));
  execFileSync(adb, ["-s", "emulator-5570", "reverse", "tcp:8766", "tcp:8766"]);
  const old = await c.native("getCloud");
  try {
    await c.native("setCloud", {
      provider: "webdav",
      url: "http://127.0.0.1:8766",
      username: "books-fixture",
      password: "test-password",
      token: "",
    });
    if (await c.evaluate(() => document.body.classList.contains("reading"))) {
      await c.click("[data-action=exit]");
      await c.poll(() => !document.body.classList.contains("reading"));
    }
    await c.click("[data-action=mobile-menu]");
    await c.click("[data-nav=settings]");
    await c.poll(() => !!document.querySelector("[data-action=cloud-backup]"));
    await c.click("[data-action=sync]");
    await c.poll(() =>
      document.querySelector("#toast")?.textContent.includes("synced"),
    );
    await c.click("[data-action=cloud-backup]");
    await c.poll(
      () =>
        document
          .querySelector("#toast")
          ?.textContent.includes("backup uploaded"),
      undefined,
      25000,
    );
    assert.ok(storage.get("/library.books").length > 100000);
    assert.equal(storage.get("/library.books").subarray(0, 2).toString(), "PK");
    await c.click("[data-action=cloud-restore]");
    await c.poll(
      () =>
        document
          .querySelector("#toast")
          ?.textContent.includes("books restored from cloud"),
      undefined,
      25000,
    );
    const prefs = execFileSync(
      adb,
      [
        "-s",
        "emulator-5570",
        "shell",
        "run-as",
        "app.books.reader",
        "cat",
        "shared_prefs/books.xml",
      ],
      { encoding: "utf8" },
    );
    assert.equal(prefs.includes("test-password"), false);
    return {
      requests,
      backupBytes: storage.get("/library.books").length,
      credentialsEncrypted: true,
      limit:
        "Local WebDAV protocol fixture; live Dropbox/Nextcloud account not tested",
    };
  } finally {
    if (old) await c.native("setCloud", old);
    else await c.native("clearCloud");
    server.close();
  }
});
await check("reading data survives WebView reload", async () => {
  if (await c.evaluate(() => document.body.classList.contains("reading")))
    await c.click("[data-action=exit]");
  await c.send("Page.reload");
  await c.poll(
    () => !!window.BooksNative && !!document.querySelector("[data-action=mobile-menu]"),
  );
  await c.click("[data-action=mobile-menu]");
  await c.click("[data-nav=notebook]");
  await c.poll(() => document.querySelectorAll(".notebook-card").length >= 1);
  return await c.evaluate(
    () =>
      document.querySelectorAll(".notebook-card").length +
      " saved notebook entries",
  );
});
await writeFile(
  "docs/android-test-results.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      device: "Android 15 / API 35 x86_64 emulator-5570",
      results,
    },
    null,
    2,
  ),
);
c.close();
if (results.some((x) => x.status === "failed")) process.exitCode = 1;
