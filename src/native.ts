declare global {
  interface Window {
    BooksNative?: {
      request: (id: string, action: string, data: string) => void;
    };
    __nativeResult?: (id: string, ok: boolean, data: any) => void;
    __nativeEvent?: (name: string, data: any) => void;
  }
}
const waiting = new Map<
  string,
  {
    resolve: (x: any) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
if ((window as any).BooksBridge)
  window.BooksNative = {
    request: (id, action, data) =>
      (window as any).BooksBridge.postMessage(
        JSON.stringify({ id, action, data: JSON.parse(data) }),
      ),
  };
window.__nativeResult = (id, ok, data) => {
  const p = waiting.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  waiting.delete(id);
  ok ? p.resolve(data) : p.reject(new Error(String(data)));
};
window.__nativeEvent = (name, data) =>
  window.dispatchEvent(new CustomEvent("native:" + name, { detail: data }));
export const isNative = () => !!window.BooksNative;
export function native(action: string, data: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!window.BooksNative)
      return reject(new Error("This action requires the Android app."));
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error("Android request timed out."));
    }, 120000);
    waiting.set(id, { resolve, reject, timer });
    window.BooksNative.request(id, action, JSON.stringify(data));
  });
}
export async function network(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const u = new URL(url);
  if (!["https:", "http:"].includes(u.protocol))
    throw Error("Use an HTTP or HTTPS address.");
  if (isNative()) {
    let bodyBase64: string | undefined;
    if (init.body && typeof init.body !== "string") {
      const bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
      if (bytes.length > 128 * 1024 * 1024)
        throw Error("Cloud transfers must be smaller than 128 MB.");
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      bodyBase64 = btoa(binary);
    }
    const data = await native("http", {
      url,
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: typeof init.body === "string" ? init.body : undefined,
      bodyBase64,
    });
    return new Response(
      [204, 205, 304].includes(data.status)
        ? null
        : Uint8Array.from(atob(data.body), (c) => c.charCodeAt(0)),
      { status: data.status, headers: data.headers },
    );
  }
  return fetch(url, init);
}
export async function saveFile(name: string, blob: Blob) {
  if (isNative()) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let str = "";
    for (let i = 0; i < bytes.length; i += 32768)
      str += String.fromCharCode(...bytes.subarray(i, i + 32768));
    await native("save", {
      name,
      mime: blob.type || "application/octet-stream",
      base64: btoa(str),
    });
  } else {
    const u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  }
}
export async function share(text: string) {
  if (isNative()) await native("share", { text });
  else if (navigator.share) await navigator.share({ text });
  else await navigator.clipboard.writeText(text);
}
export async function nativeFile(record: {
  name: string;
  url: string;
  sourceUri?: string;
}) {
  const response = await fetch(record.url);
  if (!response.ok) throw Error("The selected document could not be opened.");
  return Object.assign(new File([await response.blob()], record.name), {
    sourceUri: record.sourceUri,
  });
}
export async function writeOriginal(uri: string, blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return native("writeFile", { uri, base64: btoa(binary) });
}
