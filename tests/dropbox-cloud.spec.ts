import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page, mode = "refresh") {
  await page.addInitScript(({ mode }) => {
    const w = window as any;
    w.cloud = { provider: "dropbox", url: "", username: "", password: "", token: "old-access",
      ...(mode === "static" ? {} : {appKey: "test-app", refreshToken: "test-refresh"}) };
    w.requests = []; w.renewals = 0; w.downloads = 0;
    w.BooksNative = { request: (id: string, action: string, raw: string) => {
      const data = JSON.parse(raw);
      const done = (value: any) => setTimeout(() => w.__nativeResult(id, true, value), 0);
      const response = (status: number, body: any) => done({status, body: btoa(JSON.stringify(body)), headers: {}});
      if (action === "getCloud") return done(w.cloud);
      if (action === "setCloud") { w.cloud = data; return done(true); }
      if (action === "clearCloud") { w.cloud = null; return done(true); }
      if (action === "http") {
        w.requests.push(data);
        if (data.url === "https://api.dropboxapi.com/oauth2/token") {
          w.renewals++;
          if (mode === "revoked") return response(400,{error:"invalid_grant"});
          return response(200,{access_token:"new-access-"+w.renewals,expires_in:14400});
        }
        if (data.url.endsWith("/download")) {
          w.downloads++;
          if (mode === "retry" && w.downloads === 1 || mode === "unauthorized") return response(401,{});
          return response(409,{error_summary:"path/not_found/"});
        }
        return response(200,{});
      }
      if (action === "googleStatus") return done({configured:false});
      return done(null);
    }};
  }, { mode });
  await page.goto("/");
  await page.locator('[data-tab="profile"]').click();
  await page.locator('[data-shortcut="settings"]').first().click();
  await page.locator('summary').filter({hasText:'Cloud synchronization'}).click();
}

async function sync(page: Page) {
  if (!await page.locator('[data-action="sync"]').isVisible())
    await page.locator('summary').filter({hasText:'Cloud synchronization'}).click();
  const before = await page.evaluate(() => (window as any).requests.filter((c:any) => c.url.endsWith('/upload')).length);
  await page.locator('[data-action="sync"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).requests.filter((c:any) => c.url.endsWith('/upload')).length)).toBe(before + 1);
  await expect(page.getByText('Your reading state is synced.',{exact:true})).toBeVisible();
}

test('Dropbox renews access before sync and reuses it for download and upload', async ({ page }) => {
  await setup(page);
  await sync(page);
  const state = await page.evaluate(() => ({calls:(window as any).requests,cloud:(window as any).cloud}));
  expect(state.calls).toHaveLength(3);
  expect(new URLSearchParams(state.calls[0].body).get('refresh_token')).toBe('test-refresh');
  expect(new URLSearchParams(state.calls[0].body).get('client_id')).toBe('test-app');
  expect(state.calls.slice(1).map((c:any)=>c.headers.Authorization)).toEqual(['Bearer new-access-1','Bearer new-access-1']);
  expect(state.cloud.token).toBe('old-access'); // No access-token persistence race.
  expect(JSON.parse(state.calls[2].body)).toMatchObject({version:1,books:[],marks:[],sessions:[]});
});

test('Dropbox reuses valid access, then renews again after its lifetime', async ({ page }) => {
  await setup(page); await sync(page);
  await sync(page);
  expect(await page.evaluate(()=>(window as any).renewals)).toBe(1);
  await page.evaluate(() => { const now = Date.now(); Date.now = () => now + 14401 * 1000; });
  await sync(page);
  expect(await page.evaluate(()=>(window as any).renewals)).toBe(2);
  expect(await page.evaluate(()=>(window as any).requests.at(-1).headers.Authorization)).toBe('Bearer new-access-2');
});

test('Dropbox retries a stale authorization once with a fresh token', async ({ page }) => {
  await setup(page,'retry'); await sync(page);
  const calls=await page.evaluate(()=>(window as any).requests);
  expect(calls.filter((c:any)=>c.url.endsWith('/oauth2/token'))).toHaveLength(2);
  expect(calls.at(-1).headers.Authorization).toBe('Bearer new-access-2');
});

test('revoked Dropbox authorization stops before reading or uploading user data', async ({ page }) => {
  await setup(page,'revoked'); await page.locator('[data-action="sync"]').click();
  await expect(page.getByText('Dropbox authorization has expired or was revoked. Reconnect Dropbox in Settings.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).requests.length)).toBe(1);
});

test('persistent Dropbox 401 stops after a single retry without uploading', async ({ page }) => {
  await setup(page,'unauthorized'); await page.locator('[data-action="sync"]').click();
  await expect(page.getByText('Cloud download failed (401).',{exact:true})).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).requests);
  expect(calls).toHaveLength(4);
  expect(calls.some((c:any)=>c.url.endsWith('/upload'))).toBe(false);
});

test('legacy Dropbox tokens keep working without a refresh credential', async ({ page }) => {
  await setup(page,'static'); await sync(page);
  const calls=await page.evaluate(()=>(window as any).requests);
  expect(calls).toHaveLength(2);
  expect(calls.every((c:any)=>c.headers.Authorization==='Bearer old-access')).toBe(true);
});

test('Dropbox refresh setup requires a complete pair and stores it through the native bridge', async ({ page }) => {
  await setup(page);
  await page.locator('[data-action="connect-cloud"]').click();
  await page.locator('select[name="provider"]').selectOption('dropbox');
  await page.getByText('Keep Dropbox connected',{exact:true}).click();
  await page.locator('[name="appKey"]').fill('demo-app');
  await page.getByRole('button',{name:'Save connection'}).click();
  await expect(page.getByText('Enter both the Dropbox app key and refresh token, or leave both blank.',{exact:true})).toBeVisible();
  await page.locator('[name="refreshToken"]').fill('demo-offline');
  await page.getByRole('button',{name:'Save connection'}).click();
  await expect(page.locator('#cloud-form')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).cloud)).toMatchObject({appKey:'demo-app',refreshToken:'demo-offline',token:''});
});
