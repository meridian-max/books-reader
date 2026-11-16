import { writeFile } from "node:fs/promises";
export async function connect() {
  const pages = await (await fetch("http://127.0.0.1:9228/json/list")).json();
  const target = pages.find((p) =>
    p.url.startsWith("https://appassets.androidplatform.net/"),
  );
  if (!target)
    throw Error("Forward the Books WebView DevTools socket to tcp:9228 first.");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const requests = new Map();
  const events = new Map();
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (!m.id) { for (const listener of events.get(m.method) ?? []) listener(m.params); return; }
    const pending = requests.get(m.id);
    if (!pending) return;
    requests.delete(m.id);
    m.error
      ? pending.reject(Error(m.error.message))
      : pending.resolve(m.result);
  };
  const send = async (method, params = {}) => {
      // Wait for a fresh document, not a matching selector in the old page.
      if (method === "Page.reload") {
        const previous = await evaluate(() => performance.timeOrigin);
        await send("Runtime.evaluate", { expression: "setTimeout(() => location.reload(), 0);", returnByValue: true });
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          try { if (await evaluate(() => performance.timeOrigin) !== previous) return {}; }
          catch (error) { if (!/context|navigat/i.test(error.message)) throw error; }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw Error("Android WebView did not create a fresh document after reload.");
      }
    return new Promise((resolve, reject) => {
      const key = ++id;
      requests.set(key, { resolve, reject });
      socket.send(JSON.stringify({ id: key, method, params }));
    });
  };
  const on = (method, listener) => {
    if (!events.has(method)) events.set(method, new Set());
    events.get(method).add(listener);
    return () => events.get(method)?.delete(listener);
  };
  const evaluate = async (fn, arg) => {
    const r = await send("Runtime.evaluate", {
      expression: `(${fn.toString()})(${JSON.stringify(arg) ?? ""})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
      );
    return r.result.value;
  };
  const poll = async (fn, arg, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await evaluate(fn, arg);
      if (value) return value;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Android UI did not reach expected state: " + fn.toString());
  };
  const native = async (action, data = {}) => {
    await poll(() => !!window.BooksNative);
    return evaluate(
      ({ action, data }) =>
        new Promise((resolve, reject) => {
          const id = "test-" + crypto.randomUUID(),
            previous = window.__nativeResult;
          window.__nativeResult = (key, ok, value) => {
            if (key !== id) return previous?.(key, ok, value);
            window.__nativeResult = previous;
            ok ? resolve(value) : reject(Error(value));
          };
          window.BooksNative.request(id, action, JSON.stringify(data));
        }),
      { action, data },
    );
  };
  const click = (selector) =>
    evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) throw Error("No element: " + selector);
      el.click();
    }, selector);
  const screenshot = async (path) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(path, Buffer.from(data, "base64"));
  };
  return {
    send,
    on,
    evaluate,
    poll,
    native,
    click,
    screenshot,
    close: () => socket.close(),
  };
}
