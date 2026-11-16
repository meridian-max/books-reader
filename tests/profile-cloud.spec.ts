import { test, expect, type Page } from "@playwright/test";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import fs from "node:fs/promises";
async function you(page: Page) {
  await page.locator("[data-tab=profile]").click();
  await expect(page.locator(".profile-identity")).toBeVisible();
}
async function seed(page: Page, large = false) {
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "A quiet adventure.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "A journey through books and bright ideas.\n\n".repeat(
          large ? 60000 : 200,
        ),
      ),
    });
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("books-reader");
      r.onsuccess = () => resolve(r.result);
    });
    const tx = d.transaction(
      ["books", "sessions", "marks", "settings"],
      "readwrite",
    );
    const store = tx.objectStore("books");
    const r = store.getAll();
    r.onsuccess = () => {
      const b = r.result[0];
      b.lastRead = 100;
      b.progress = 0.35;
      b.location = "test-location";
      b.seconds = 720;
      store.put(b);
      tx.objectStore("sessions").put({
        id: "session-one",
        bookId: b.id,
        date: new Date().toLocaleDateString("en-CA"),
        seconds: 720,
        words: 1200,
      });
      tx.objectStore("marks").put({
        id: "mark-one",
        bookId: b.id,
        type: "highlight",
        quote: "bright ideas",
        note: "Remember this",
        location: 0,
        color: "#ffe077",
        created: 1,
        updated: 1,
      });
      tx.objectStore("settings").put(
        { name: "Mira", avatar: "moon", joined: 1 },
        "profile",
      );
      const s = tx.objectStore("settings").get("reader");
      s.onsuccess = () =>
        tx
          .objectStore("settings")
          .put({ ...s.result, fontSize: 27, dailyGoal: 10 }, "reader");
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    d.close();
  });
  await page.reload();
}
async function fakeGoogle(page: Page, signed = true, archive = "") {
  await page.addInitScript(
    ({ signed, archive }) => {
      const w = window as any;
      let user = signed
        ? {
            id: "fixture-user",
            name: "Mira",
            email: "reader@example.test",
            picture: "",
          }
        : null;
      w.cloudCalls = [];
      w.uploaded = [];
      w.fixtureArchive = archive;
      w.cancelSignIn = false;
      w.failUpload = false;
      w.BooksNative = {
        request: (id: string, action: string, raw: string) => {
          const a = JSON.parse(raw);
          const done = (ok: boolean, data: any) =>
            setTimeout(() => w.__nativeResult(id, ok, data), 0);
          const response = (status: number, body: any, headers = {}) =>
            done(true, {
              status,
              body: btoa(
                typeof body === "string" ? body : JSON.stringify(body),
              ),
              headers,
            });
          if (action === "googleStatus") return done(true, {configured: !w.googleUnconfigured});
          if (action === "googleProfile") return done(true, user);
          if (action === "googleSignIn") {
            if (w.cancelSignIn)
              return done(
                false,
                "Sign-in cancelled. You can keep reading offline.",
              );
            user = {
              id: "fixture-user",
              name: "Mira",
              email: "reader@example.test",
              picture: "",
            };
            return done(true, user);
          }
          if (action === "googleSignOut") {
            user = null;
            return done(true, true);
          }
          if (action === "googleAuthorize") {
            w.cloudCalls.push(action);
            return done(true, true);
          }
          if (action === "googleHttp") {
            w.cloudCalls.push({
              url: a.url,
              method: a.method,
              headers: a.headers,
            });
            if (a.method === "POST")
              return response(
                200,
                {},
                {
                  Location:
                    "https://www.googleapis.com/upload/drive/v3/files?upload_id=fixture",
                },
              );
            if (a.method === "PUT") {
              if (w.failUpload)
                return response(503, { error: "temporary failure" });
              w.uploaded.push(a.bodyBase64);
              const range = a.headers["Content-Range"]
                .match(/bytes (\d+)-(\d+)\/(\d+)/)
                .map(Number);
              return Number(range[2]) + 1 < Number(range[3])
                ? response(308, "", { Range: `bytes=0-${range[2]}` })
                : response(200, {
                    id: "saved-fixture",
                    size: String(range[3]),
                  });
            }
            const bytes = atob(w.fixtureArchive);
            if (a.url.includes("alt=media")) {
              const range = a.headers.Range.match(/bytes=(\d+)-(\d+)/);
              return response(
                206,
                bytes.slice(Number(range[1]), Number(range[2]) + 1),
              );
            }
            const entry = {
              id: "saved-fixture",
              name: "Books fixture.books",
              size: String(bytes.length),
              modifiedTime: "2026-11-15T10:00:00Z",
              appProperties: {
                booksBackup: "1",
                books: "1",
                notes: "1",
                sessions: "1",
              },
            };
            return a.url.includes("/files/saved-fixture")
              ? response(200, entry)
              : response(200, { files: archive ? [entry] : [] });
          }
          if (
            ["getCloud", "getFolder", "getFtp", "getReadwise"].includes(action)
          )
            return done(true, null);
          return done(true, false);
        },
      };
    },
    { signed, archive },
  );
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("books-reader");
      r.onsuccess = () => resolve(r.result);
    });
    const get = (store: string, key?: string) =>
      new Promise<any>((resolve) => {
        const s = d.transaction(store).objectStore(store),
          r = key ? s.get(key) : s.getAll();
        r.onsuccess = () => resolve(r.result);
      });
    const [books, marks, sessions, settings, profile] = await Promise.all([
      get("books"),
      get("marks"),
      get("sessions"),
      get("settings", "reader"),
      get("settings", "profile"),
    ]);
    d.close();
    return {
      books: books.map(({ blob, ...b }: any) => ({ ...b, bytes: blob.size })),
      marks,
      sessions,
      settings,
      profile,
    };
  });
}

test("profile editing, daily progress and history work offline and survive restart", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await seed(page);
  await you(page);
  await expect(page.locator(".profile-identity h1")).toHaveText("Mira");
  await expect(page.locator(".habit-progress")).toContainText("12");
  await page
    .getByRole("button", { name: "Edit profile", exact: true })
    .first()
    .click();
  await page.getByLabel("Name", {exact:true}).fill("Arun");
  await page.locator("[data-avatar=sparkles]").click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator(".profile-identity h1")).toHaveText("Arun");
  await page.reload();
  await you(page);
  await expect(page.locator(".profile-identity h1")).toHaveText("Arun");
  await page.locator("[data-shortcut=history]").click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await expect(page.locator(".history-row")).toContainText("12 min");
  await page.locator("#history-search").fill("missing");
  await expect(page.locator(".history-row")).toHaveCount(0);
  await page.locator("#history-search").fill("quiet");
  await expect(page.locator(".history-row")).toHaveCount(1);
  await page.locator(".history-row").click();
  await expect(page.locator("#reader")).toBeVisible();
});
test("motion preference disables animation and retains every navigation destination", async ({
  page,
}) => {
  await page.goto("/");
  await you(page);
  await page.locator("[data-shortcut=settings]").first().click();
  await page.locator(".settings-panel summary").first().click();
  await page.locator("[data-setting=motion]").selectOption("reduced");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await you(page);
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
  ).toBe(0);
  await expect(page.locator(".bottom-nav button")).toHaveText([
    "Home",
    "Library",
    "Notes",
    "You",
  ]);
});
test("cancelled Google login keeps a guest profile and all local data intact", async ({
  page,
}) => {
  await fakeGoogle(page, false);
  await page.goto("/");
  await seed(page);
  const before = await state(page);
  await you(page);
  await page.evaluate(() => {
    (window as any).cancelSignIn = true;
  });
  await page.locator("[data-profile=signin]").click();
  await expect(page.locator("#toast")).toContainText("cancelled");
  await expect(page.locator("[data-profile=signin]")).toBeEnabled();
  expect(await state(page)).toEqual(before);
});
test("Drive uploads real multi-chunk complete backup, restores it, and sign out retains local books", async ({
  browser,
}) => {
  const source = await browser.newPage();
  await fakeGoogle(source);
  await source.goto("/");
  await seed(source, true);
  const before = await state(source);
  await you(source);
  await source.locator("[data-profile=backup]").click();
  await expect(source.locator("#toast")).toContainText(
    "complete library is saved",
    { timeout: 45000 },
  );
  const chunks = await source.evaluate(
    () => (window as any).uploaded as string[],
  );
  expect(chunks.length).toBeGreaterThan(1);
  const bytes = Buffer.concat(chunks.map((x) => Buffer.from(x, "base64")));
  const manifest = JSON.parse(strFromU8(unzipSync(bytes)["manifest.json"]));
  expect(manifest.sessions).toEqual(before.sessions);
  expect(manifest.marks).toEqual(before.marks);
  expect(manifest.settings.fontSize).toBe(27);
  expect(manifest.profile.name).toBe("Mira");
  expect(JSON.stringify(manifest)).not.toMatch(
    /fixture-user|reader@example|accessToken|googleProfile/,
  );
  const target = await browser.newPage();
  await fakeGoogle(target, true, bytes.toString("base64"));
  await target.goto("/");
  await you(target);
  await target.locator("[data-profile=restore]").click();
  await target.locator('[data-backup="0"]').click();
  await target
    .getByRole("button", { name: "Restore library", exact: true })
    .click();
  await expect(target.locator("#toast")).toContainText("1 books restored", {
    timeout: 45000,
  });
  const after = await state(target);
  expect(after.books).toEqual(before.books);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.marks).toEqual(before.marks);
  expect(after.profile).toEqual(before.profile);
  expect(after.settings.fontSize).toBe(27);
  await target.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("books-reader");
      r.onsuccess = () => resolve(r.result);
    });
    const tx = d.transaction(["books", "sessions"], "readwrite");
    const b = tx.objectStore("books").getAll();
    b.onsuccess = () =>
      tx
        .objectStore("books")
        .put({ ...b.result[0], progress: 0.8, lastRead: 200 });
    const session = tx.objectStore("sessions").get("session-one");
    session.onsuccess = () =>
      tx.objectStore("sessions").put({ ...session.result, seconds: 1200 });
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    d.close();
  });
  await target.locator("[data-profile=restore]").click();
  await target.locator('[data-backup="0"]').click();
  await target
    .getByRole("button", { name: "Restore library", exact: true })
    .click();
  await expect(target.locator("#toast")).toContainText("1 books restored");
  const merged = await state(target);
  expect(merged.books[0].progress).toBe(0.8);
  expect(merged.sessions[0].seconds).toBe(1200);
  await target.locator("[data-profile=signout]").click();
  await target
    .locator(".modal")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(target.locator("[data-profile=signin]")).toBeVisible();
  expect(await state(target)).toEqual(merged);
  await source.close();
  await target.close();
});
test("a failed cloud upload never records a successful backup and permits retry", async ({
  page,
}) => {
  await fakeGoogle(page);
  await page.goto("/");
  await seed(page);
  await you(page);
  await page.evaluate(() => {
    (window as any).failUpload = true;
  });
  await page.locator("[data-profile=backup]").click();
  await expect(page.locator("#toast")).toContainText("503");
  await expect(page.locator("[data-profile=backup]")).toBeEnabled();
  await you(page);
  await expect(page.locator(".backup-status")).toContainText("No backup");
  await expect(page.locator(".cloud-error")).toContainText("503");
  await page.evaluate(() => {
    (window as any).failUpload = false;
  });
  await page.locator("[data-profile=backup]").click();
  await expect(page.locator("#toast")).toContainText(
    "complete library is saved",
  );
});
test("corrupted backup is rejected before any library records change", async ({
  page,
}) => {
  await page.goto("/");
  await seed(page);
  const before = await state(page);
  const bytes = zipSync({
    "manifest.json": strToU8(
      JSON.stringify({
        version: 2,
        checksums: { [before.books[0].id]: before.books[0].id },
        books: [{ ...before.books[0] }],
        marks: before.marks,
        sessions: before.sessions,
        settings: { fontSize: 10 },
      }),
    ),
    ["books/" + before.books[0].id]: strToU8("corrupted content"),
  });
  await page
    .locator("#restore-input")
    .setInputFiles({
      name: "damaged.books",
      mimeType: "application/zip",
      buffer: Buffer.from(bytes),
    });
  await expect(page.locator("#toast")).toContainText("damaged");
  expect(await state(page)).toEqual(before);
});

test('backup checksums preserve edited book bytes and legacy backups remain importable', async({browser})=>{
  const source=await browser.newPage();await fakeGoogle(source);await source.goto('/');await seed(source);
  await source.evaluate(async()=>{const d=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('books-reader');r.onsuccess=()=>resolve(r.result)});const tx=d.transaction('books','readwrite');const r=tx.objectStore('books').getAll();r.onsuccess=()=>tx.objectStore('books').put({...r.result[0],blob:new Blob(['This book has saved edits.']),size:26});await new Promise<void>(resolve=>tx.oncomplete=()=>resolve());d.close();});
  await you(source);await source.locator('[data-profile=backup]').click();await expect(source.locator('#toast')).toContainText('complete library is saved');
  const chunks=await source.evaluate(()=>(window as any).uploaded as string[]);const bytes=Buffer.concat(chunks.map(x=>Buffer.from(x,'base64')));const files=unzipSync(bytes);const manifest=JSON.parse(strFromU8(files['manifest.json']));expect(manifest.version).toBe(2);expect(manifest.checksums[manifest.books[0].id]).not.toBe(manifest.books[0].id);
  const target=await browser.newPage();await target.goto('/');await target.locator('#restore-input').setInputFiles({name:'edited.books',mimeType:'application/zip',buffer:bytes});await expect(target.locator('#toast')).toContainText('1 books restored');expect((await state(target)).books[0].bytes).toBe(26);
  manifest.version=1;delete manifest.checksums;files['manifest.json']=strToU8(JSON.stringify(manifest));await target.locator('#restore-input').setInputFiles({name:'legacy.books',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});await expect(target.locator('#toast')).toContainText('1 books restored');await source.close();await target.close();
});


test("unconfigured Android sign-in is explained before tapping and local backup stays available", async ({page}) => {
  await fakeGoogle(page, false);
  await page.addInitScript(() => { (window as any).googleUnconfigured = true; });
  await page.goto('/');
  await seed(page);
  const before = await state(page);
  await you(page);
  await expect(page.locator('.google-unavailable')).toContainText('Google sign-in setup incomplete');
  await expect(page.locator('[data-profile=signin]')).toHaveCount(0);
  await expect(page.locator('.local-backup-actions [data-action=backup]')).toBeEnabled();
  await expect(page.locator('.local-backup-actions [data-action=restore]')).toBeEnabled();
  expect(await state(page)).toEqual(before);
});
