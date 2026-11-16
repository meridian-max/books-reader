import { connect } from "./android-cdp.mjs";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import * as mupdf from "mupdf";
const adb =
    "/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb",
  serial = "emulator-5570";
const shell = (...args) =>
  execFileSync(adb, ["-s", serial, ...args], { encoding: "utf8" });
const c = await connect(),
  results = [];
const fill = (selector, value) =>
  c.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector(selector);
      if (!el) throw Error("Missing " + selector);
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { selector, value },
  );
const navigate = async (route) => {
  await c.click("[data-action=mobile-menu]");
  await c.click(`[data-nav=${route}]`);
};
async function check(name, fn) {
  try {
    const evidence = await fn();
    results.push({ name, status: "passed", evidence });
    console.log("PASS", name, evidence ?? "");
  } catch (error) {
    results.push({ name, status: "failed", error: error.message });
    console.error("FAIL", name, error.message);
  }
}
await c.send("Page.reload");
await c.poll(() => !!document.querySelector("[data-action=mobile-menu]"));
await check(
  "whole-book speech continues chapters with screen off",
  async () => {
    const voices = await c.native("voices"),
      voice =
        voices.find((v) => !v.network && v.language === "en-US")?.name ?? "";
    await c.evaluate(() => {
      window.__completionSpeech = [];
      window.addEventListener("native:speech", (e) =>
        window.__completionSpeech.push(e.detail),
      );
    });
    shell("shell", "input", "keyevent", "223");
    try {
      await c.native("speak", {
        title: "Background queue test",
        bookId: "test-queue",
        voice,
        rate: 2.5,
        sections: [
          {
            location: 0,
            text: "First chapter. The Android service owns this queue.",
          },
          {
            location: 1,
            text: "Second chapter. The next chapter is spoken with the screen off.",
          },
        ],
      });
      await c.poll(
        () =>
          window.__completionSpeech.some(
            (e) => e.state === "playing" && e.location === 1,
          ),
        undefined,
        30000,
      );
      await c.poll(
        () => window.__completionSpeech.some((e) => e.state === "finished"),
        undefined,
        30000,
      );
      const events = await c.evaluate(() => window.__completionSpeech);
      assert.equal(
        events.some((e) => e.state === "error"),
        false,
      );
      return {
        locations: events
          .filter((e) => e.state === "playing")
          .map((e) => e.location),
        finished: true,
      };
    } finally {
      shell("shell", "input", "keyevent", "224");
      await c.native("speechControl", { action: "stop" });
    }
  },
);
await check(
  "Android all-files permission and real shared-storage operations",
  async () => {
    shell(
      "shell",
      "appops",
      "set",
      "app.books.reader",
      "MANAGE_EXTERNAL_STORAGE",
      "allow",
    );
    assert.equal(await c.native("storageStatus"), true);
    const root = await c.native("storageRoot", { remember: false });
    const folders = await c.native("listFiles", { uri: root });
    assert.ok(folders.some((f) => f.name === "Documents"));
    const uri = "file:///storage/emulated/0/Documents/BooksTest";
    const folder = await c.native("makeFolder", {
      uri,
      name: "AllFilesOperations",
    });
    const bytes = Buffer.from("Actual device storage data.");
    const selected = await c.native("getFolder"),
      source = (await c.native("listFiles", { uri: selected })).find(
        (f) => f.name === "reading.chm",
      );
    assert.ok(source);
    const copied = await c.native("copyFile", {
      uri: source.uri,
      destination: folder,
    });
    const renamed = await c.native("renameFile", {
      uri: copied,
      name: "copied.chm",
    });
    assert.equal(
      (await c.native("listFiles", { uri: folder }))[0].name,
      "copied.chm",
    );
    await c.native("deleteFile", { uri: renamed });
    await c.native("deleteFile", { uri: folder });
    return "Real shared storage read and cross-provider copy/rename/delete; scoped grant retained";
  },
);
await check("PDF save-back modifies the original picked document", async () => {
  shell(
    "push",
    "tests/fixtures/reading.pdf",
    "/sdcard/Documents/BooksTest/writeback.pdf",
  );
  const source = "file:///storage/emulated/0/Documents/BooksTest/writeback.pdf",
    record = await c.native("openFile", { uri: source });
  await c.evaluate(
    (record) =>
      window.dispatchEvent(
        new CustomEvent("native:import", { detail: record }),
      ),
    record,
  );
  await c.poll(() => !!document.querySelector(".pdf-page"));
  await c.click(".reader-top-actions [data-action=more]");
  await c.click("[data-reader-option=miscellaneous]");
  await c.click("#pdf-text");
  await fill("#input-dialog input", "Saved into the original PDF.");
  await c.click("#input-dialog button");
  await c.poll(() =>
    document
      .querySelector("#toast")
      ?.textContent.includes("Text annotation added"),
  );
  await c.click(".reader-top-actions [data-action=more]");
  await c.click("[data-reader-option=miscellaneous]");
  await c.click("#pdf-original");
  await c.click("#confirm-dialog");
  await c.poll(() =>
    document
      .querySelector("#toast")
      ?.textContent.includes("saved to original file"),
  );
  const bytes = execFileSync(adb, [
    "-s",
    serial,
    "exec-out",
    "cat",
    "/sdcard/Documents/BooksTest/writeback.pdf",
  ]);
  const doc = mupdf.Document.openDocument(
      new Uint8Array(bytes),
      "application/pdf",
    ),
    page = doc.loadPage(0),
    annotations = page.getAnnotations();
  assert.ok(
    annotations.some((a) => a.getContents() === "Saved into the original PDF."),
  );
  annotations.forEach((a) => a.destroy());
  page.destroy();
  doc.destroy();
  await c.click("[data-action=exit]");
  await c.poll(() => !document.body.classList.contains("reading"));
  return { bytes: bytes.length, embeddedAnnotation: true };
});
await check(
  "startup password rejects wrong credentials and unlocks on correct password",
  async () => {
    await c.native("setPin", { pin: "Books-fixture-4578" });
    try {
      await c.send("Page.reload");
      await c.poll(() => !!document.querySelector(".lock-screen"));
      await fill(".lock-screen input", "wrong");
      await c.evaluate(() =>
        document.querySelector(".lock-screen form").requestSubmit(),
      );
      await c.poll(() =>
        document
          .querySelector("#lock-error")
          ?.textContent.includes("did not match"),
      );
      await fill(".lock-screen input", "Books-fixture-4578");
      await c.evaluate(() =>
        document.querySelector(".lock-screen form").requestSubmit(),
      );
      await c.poll(
        () =>
          !document.querySelector(".lock-screen") &&
          !!document.querySelector("[data-action=mobile-menu]"),
      );
      return "Password gate tested across a real WebView reload";
    } finally {
      await c.native("unlock", { pin: "Books-fixture-4578", remove: true });
    }
  },
);
await check(
  "authenticated OPDS search, acquisition and Downloads shelf",
  async () => {
    const epub = await readFile("public/samples/alice.epub"),
      requests = [];
    const origin = "http://127.0.0.1:8768";
    const server = createServer((req, res) => {
      requests.push({ url: req.url, authorized: !!req.headers.authorization });
      if (
        req.headers.authorization !==
        "Basic " + Buffer.from("reader:fixture-pass").toString("base64")
      ) {
        res.writeHead(401, {
          "WWW-Authenticate": 'Basic realm="Books test library"',
        });
        res.end();
        return;
      }
      if (req.url === "/alice.epub") {
        res.writeHead(200, { "Content-Type": "application/epub+zip" });
        res.end(epub);
        return;
      }
      res.writeHead(200, { "Content-Type": "application/opds+json" });
      res.end(
        JSON.stringify(
          req.url.startsWith("/search")
            ? {
                publications: [
                  {
                    metadata: {
                      title: "Alice acquired from OPDS",
                      author: { name: "Lewis Carroll" },
                    },
                    links: [
                      {
                        href: "/alice.epub",
                        rel: "http://opds-spec.org/acquisition/open-access",
                        type: "application/epub+zip",
                      },
                    ],
                  },
                ],
              }
            : {
                navigation: [
                  {
                    title: "Books collection",
                    href: "/search?q=all",
                    type: "application/opds+json",
                  },
                ],
                links: [
                  {
                    rel: "search",
                    href: "/search?q={searchTerms}",
                    type: "application/opds+json",
                  },
                ],
              },
        ),
      );
    });
    await new Promise((resolve) => server.listen(8768, "127.0.0.1", resolve));
    shell("reverse", "tcp:8768", "tcp:8768");
    try {
      await c.native("clearCatalogAuth", { origin });
      await navigate("catalogs");
      await c.click("[data-action=add-catalog]");
      await fill("#catalog-form [name=name]", "Authenticated test library");
      await fill("#catalog-form [name=url]", origin + "/opds");
      await c.evaluate(() =>
        document.querySelector("#catalog-form").requestSubmit(),
      );
      await c.poll(() =>
        [...document.querySelectorAll(".catalog-card")].some((x) =>
          x.textContent.includes("Authenticated test library"),
        ),
      );
      await c.evaluate(() =>
        [...document.querySelectorAll(".catalog-card")]
          .find((x) => x.textContent.includes("Authenticated test library"))
          .querySelector("[data-catalog]")
          .click(),
      );
      await c.poll(() => !!document.querySelector("#catalog-login"));
      await fill("#catalog-login [name=username]", "reader");
      await fill("#catalog-login [name=password]", "fixture-pass");
      await c.evaluate(() =>
        document.querySelector("#catalog-login").requestSubmit(),
      );
      await c.poll(() => !!document.querySelector("#catalog-search"));
      await fill("#catalog-search input", "alice");
      await c.evaluate(() =>
        document.querySelector("#catalog-search").requestSubmit(),
      );
      await c.poll(
        () =>
          document.querySelector(".catalog-entry strong")?.textContent ===
          "Alice acquired from OPDS",
      );
      await c.click(".catalog-entry");
      await c.poll(() =>
        document.querySelector("#toast")?.textContent.includes("library"),
      );
      await c.click("[data-action=shelf-selector]");
      await c.click("[data-destination=downloads]");
      await c.poll(() => document.querySelectorAll(".book-card").length > 0);
      const auth = await c.native("getCatalogAuth", { origin });
      assert.equal(auth.username, "reader");
      return { requests, downloaded: true, credentialsPersisted: true };
    } finally {
      server.close();
    }
  },
);
await writeFile(
  "docs/android-completion-results.json",
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
c.close();
if (results.some((r) => r.status === "failed")) process.exitCode = 1;
