import { renderDocx, renderOdt, renderMhtml, decodeText } from "./documents";
import { parseUmdBook } from "./umd";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { escapeHTML, textOf, type Book, uid } from "./types";
import { inputDialog } from "./ui";
import { native, isNative } from "./native";
export const supported = [
  "chm",
  "umd",
  "djvu",
  "djv",
  "epub",
  "pdf",
  "mobi",
  "azw",
  "azw3",
  "prc",
  "fb2",
  "fbz",
  "cbz",
  "cbr",
  "txt",
  "html",
  "htm",
  "md",
  "markdown",
  "docx",
  "odt",
  "rtf",
  "mht",
  "mhtml",
  "webp",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "zip",
  "rar",
];

function archivedHtmlBook(
  files: Record<string, Uint8Array>,
  title: string,
  home: string,
  tocFile: string,
) {
  const urls = new Map<string, string>(),
    resolving = new Set<string>();
  const normalized = (base: string, path: string) =>
    decodeURIComponent(
      new URL(path, "https://book.invalid/" + base).pathname,
    ).replace(/^\//, "");
  const mime = (path: string) =>
    ({
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      webp: "image/webp",
      css: "text/css",
      ttf: "font/ttf",
      otf: "font/otf",
    })[ext(path)] ?? "application/octet-stream";
  const getURL = (path: string): string => {
    if (urls.has(path)) return urls.get(path)!;
    const bytes = files[path];
    if (!bytes || resolving.has(path)) return "";
    resolving.add(path);
    let data: BlobPart = bytes;
    if (ext(path) === "css") {
      let css = strFromU8(bytes);
      css = css.replace(
        /url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g,
        (_match, relative) => {
          if (/^(?:https?:|data:|blob:)/i.test(relative)) return 'url("")';
          const target = normalized(path, relative);
          return target === path ? 'url("")' : `url("${getURL(target)}")`;
        },
      );
      data = css;
    }
    const url = URL.createObjectURL(new Blob([data], { type: mime(path) }));
    urls.set(path, url);
    resolving.delete(path);
    return url;
  };
  const names = Object.keys(files).filter((n) => /\.html?$/i.test(n));
  if (!names.length) throw Error("This CHM has no readable HTML pages.");
  let toc: any[] = [];
  const tocKey = (tocFile ?? "").replace(/^\//, "");
  if (files[tocKey]) {
    const doc = new DOMParser().parseFromString(
      strFromU8(files[tocKey]),
      "text/html",
    );
    for (const object of doc.querySelectorAll("object")) {
      const params = [...object.querySelectorAll("param")];
      const label = params
        .find((p) => p.getAttribute("name")?.toLowerCase() === "name")
        ?.getAttribute("value");
      const local = params
        .find((p) => p.getAttribute("name")?.toLowerCase() === "local")
        ?.getAttribute("value");
      if (label && local)
        toc.push({
          label,
          href:
            normalized(tocKey, local) +
            (local.includes("#") ? "#" + local.split("#")[1] : ""),
        });
    }
  }
  const order = [
    ...new Set([
      ...(home ? [home.replace(/^\//, "")] : []),
      ...toc.map((t) => t.href.split("#")[0]),
      ...names,
    ]),
  ].filter((n) => names.includes(n));
  const documents = new Map<string, string>();

  const prepare = (path: string) => {
    if (documents.has(path)) return documents.get(path)!;
    const doc = new DOMParser().parseFromString(
      clean(strFromU8(files[path])),
      "text/html",
    );
    for (const el of doc.querySelectorAll("[src],[href]")) {
      for (const attr of ["src", "href"]) {
        const value = el.getAttribute(attr);
        if (!value || /^(https?:|mailto:|tel:|data:|blob:|#)/i.test(value))
          continue;
        if (el.localName === "a" && attr === "href") continue;
        const url = getURL(normalized(path, value));
        if (url) el.setAttribute(attr, url);
        else el.removeAttribute(attr);
      }
    }
    for (const el of doc.querySelectorAll<HTMLElement>("[style]"))
      el.style.cssText = el.style.cssText.replace(/url\([^)]+\)/g, "none");
    const html = doc.documentElement.outerHTML;
    documents.set(path, html);
    return html;
  };
  if (!toc.length)
    toc = order.map((path, index) => ({
      label:
        path.replace(/.*\//, "").replace(/\.html?$/i, "") ||
        "Chapter " + (index + 1),
      href: path,
    }));
  return {
    metadata: { title },
    sections: order.map((path) => ({
      id: path,
      size: files[path].length,
      load: () => {
        const key = "html:" + path;
        if (!urls.has(key))
          urls.set(
            key,
            URL.createObjectURL(
              new Blob([prepare(path)], { type: "text/html" }),
            ),
          );
        return urls.get(key);
      },
      resolveHref: (href: string) =>
        normalized(path, href) +
        (href.includes("#") ? "#" + href.split("#")[1] : ""),
      createDocument: () =>
        new DOMParser().parseFromString(prepare(path), "text/html"),
    })),
    toc,
    resolveHref: (href: string) => ({
      index: Math.max(0, order.indexOf(href.split("#")[0])),
      anchor: (doc: Document) => doc.getElementById(href.split("#")[1]),
    }),
    splitTOCHref: (href: string) => href.split("#"),
    getTOCFragment: (doc: Document, id: string) => doc.getElementById(id),
    isExternal: (href: string) => /^https?:/i.test(href),
    destroy: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
  };
}
export const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
let foliatePromise: Promise<any>;
export function foliate() {
  const path = "/foliate/view.js";
  return (foliatePromise ??= import(/* @vite-ignore */ path));
}
export const clean = (html: string) =>
  DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|blob):|data:(?:image|audio|video|font)\/|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ADD_ATTR: ["epub:type", "xmlns:epub", "xlink:href"],
    ADD_TAGS: ["audio", "video", "source"],
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "meta",
      "base",
    ],
    FORBID_ATTR: ["srcdoc", "action", "formaction"],
  });
function htmlBook(html: string, title: string) {
  const source = clean(html),
    doc = new DOMParser().parseFromString(source, "text/html");
  const headings = [...doc.querySelectorAll("h1,h2,h3")];
  headings.forEach((h, i) => {
    if (!h.id) h.id = "chapter-" + i;
  });
  const content = doc.documentElement.outerHTML;
  let url = "";
  return {
    metadata: { title, author: "" },
    sections: [
      {
        id: "main",
        size: content.length,
        load: () =>
          (url ||= URL.createObjectURL(
            new Blob([content], { type: "text/html" }),
          )),
        unload: () => {
          if (url) URL.revokeObjectURL(url);
          url = "";
        },
        createDocument: () =>
          new DOMParser().parseFromString(content, "text/html"),
      },
    ],
    toc: headings.map((h) => ({ label: h.textContent, href: "0#" + h.id })),
    resolveHref: (href: string) => ({
      index: 0,
      anchor: (d: Document) => d.getElementById(href.split("#")[1]),
    }),
    splitTOCHref: (href: string) => ["main", href.split("#")[1]],
    getTOCFragment: (d: Document, id: string) => d.getElementById(id),
    isExternal: (s: string) => /^https?:/.test(s),
    destroy: () => {
      if (url) URL.revokeObjectURL(url);
    },
  };
}
async function archive(file: File): Promise<Record<string, Uint8Array>> {
  if (ext(file.name) === "zip" || ext(file.name) === "cbz") {
    let size = 0,
      count = 0;
    try {
      return unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: (entry) => {
          if (
            ++count > 10000 ||
            entry.originalSize > 100 * 1024 * 1024 ||
            (size += entry.originalSize) > 256 * 1024 * 1024
          )
            throw Error("The extracted archive exceeds supported limits.");
          return true;
        },
      });
    } catch (error) {
      if (/exceeds supported limits/i.test((error as Error).message))
        throw error;
    }
  }
  const { Archive } = await import("libarchive.js");
  Archive.init({ workerUrl: "/engines/archive/worker-bundle.js" });
  const a = await Archive.open(file);
  try {
    if (await a.hasEncryptedData()) {
      const password = await inputDialog(
        "Encrypted archive",
        "Archive password",
        "",
        "password",
      );
      if (password === null) throw Error("Import cancelled.");
      await a.usePassword(password);
    }
    const entries = await a.getFilesArray();
    if (entries.length > 10000) throw Error("This archive has too many files.");
    const out: Record<string, Uint8Array> = {};
    let size = 0;
    for (const e of entries) {
      const f = await e.file.extract();
      size += f.size;
      if (size > 256 * 1024 * 1024)
        throw Error("The extracted archive exceeds 256 MB.");
      out[e.path + f.name] = new Uint8Array(await f.arrayBuffer());
    }
    return out;
  } finally {
    await a.close();
  }
}
export async function expandArchive(
  file: File,
  depth = 0,
  budget = { size: 0, count: 0 },
): Promise<File[]> {
  if (depth > 5) throw Error("The archive is too deeply nested.");
  const contents = await archive(file),
    out: File[] = [];
  const names = Object.keys(contents).filter(
    (path) => !path.includes("__MACOSX") && !path.endsWith("/"),
  );
  if (
    names.length &&
    names.every((path) => /\.(jpe?g|png|gif|webp)$/i.test(path))
  )
    return [
      new File(
        [zipSync(contents, { level: 0 })],
        file.name.replace(/\.[^.]+$/, "") + ".cbz",
      ),
    ];
  for (const [path, bytes] of Object.entries(contents)) {
    const format = ext(path);
    if (!supported.includes(format)) continue;
    if (
      (budget.size += bytes.length) > 256 * 1024 * 1024 ||
      ++budget.count > 10000
    )
      throw Error("The extracted books exceed supported limits.");
    const entry = new File([bytes], path.split("/").pop()!);
    if (["zip", "rar"].includes(format))
      out.push(...(await expandArchive(entry, depth + 1, budget)));
    else out.push(entry);
  }
  return out;
}
export async function makeEngineBook(file: File): Promise<any> {
  const format = ext(file.name),
    title = file.name.replace(/\.[^.]+$/, "");
  if (format === "umd") {
    const umd = parseUmdBook(await file.arrayBuffer());
    if (!umd.chapters.some((c) => c.content || c.images.length))
      throw Error("This UMD contains no readable text or images.");
    const files: Record<string, Uint8Array> = {},
      toc: string[] = [];
    umd.chapters.forEach((chapter, i) => {
      const path = `chapter-${i}.html`;
      toc.push(
        `<object><param name="Name" value="${escapeHTML(chapter.title)}"><param name="Local" value="${path}"></object>`,
      );
      const images = chapter.images
        .map((image, j) => {
          const name = `image-${i}-${j}.${image.extension}`;
          files[name] = image.bytes;
          return `<img src="${name}" alt="Page ${j + 1}" style="max-width:100%">`;
        })
        .join("");
      files[path] = strToU8(
        `<html><body><h1>${escapeHTML(chapter.title)}</h1>${chapter.content
          .split(/\n+/)
          .map((t) => `<p>${escapeHTML(t)}</p>`)
          .join("")}${images}</body></html>`,
      );
    });
    files["contents.hhc"] = strToU8(toc.join(""));
    const engine: any = archivedHtmlBook(
      files,
      umd.title,
      "chapter-0.html",
      "contents.hhc",
    );
    engine.metadata = {
      title: umd.title,
      author: umd.author,
      publisher: umd.publisher,
      subject: umd.category,
    };
    if (umd.cover)
      engine.getCover = () =>
        new Blob([umd.cover!.bytes], { type: umd.cover!.mimeType });
    return engine;
  }
  if (format === "chm") {
    if (!isNative())
      throw Error("CHM decoding is available in the Android app.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    const result = await native("extractChm", { base64: btoa(binary) });
    const data = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
    const files = unzipSync(data);
    return archivedHtmlBook(
      files,
      result.title || title,
      result.home,
      result.toc,
    );
  }
  if (
    ["epub", "mobi", "azw", "azw3", "prc", "fb2", "fbz", "cbz"].includes(format)
  )
    return (await foliate()).makeBook(file);
  if (format === "cbr" || format === "rar") {
    const files = await archive(file);
    const entries = Object.entries(files)
      .filter(([n]) => /\.(jpe?g|png|webp|gif)$/i.test(n))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
    if (!entries.length)
      throw Error("This comic archive contains no supported images.");
    const zipped = zipSync(Object.fromEntries(entries), { level: 0 });
    return (await foliate()).makeBook(new File([zipped], title + ".cbz"));
  }
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(format)) {
    const zipped = zipSync(
      { [file.name]: new Uint8Array(await file.arrayBuffer()) },
      { level: 0 },
    );
    return (await foliate()).makeBook(new File([zipped], title + ".cbz"));
  }
  let html = "";
  if (format === "docx") {
    try {
      return htmlBook(await renderDocx(file), title);
    } catch (error) {
      // Recover plain content from malformed documents lacking optional package parts.
      const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const xml = files["word/document.xml"];
      if (!xml) throw error;
      const doc = new DOMParser().parseFromString(
        strFromU8(xml),
        "application/xml",
      );
      if (doc.querySelector("parsererror")) throw error;
      html = [...doc.getElementsByTagNameNS("*", "p")]
        .map(
          (p) =>
            "<p>" +
            [...p.getElementsByTagNameNS("*", "t")]
              .map((t) => escapeHTML(t.textContent))
              .join("") +
            "</p>",
        )
        .join("");
    }
  } else if (format === "odt") {
    return htmlBook(await renderOdt(file), title);
  } else if (format === "rtf") {
    const input = await file.text();
    let text = "",
      skip = 0;
    const stack: boolean[] = [];
    let ignored = false;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (c === "{") {
        stack.push(ignored);
        continue;
      }
      if (c === "}") {
        ignored = stack.pop() ?? false;
        continue;
      }
      if (c === "\\") {
        const rest = input.slice(i);
        const hex = rest.match(/^\\'([0-9a-f]{2})/i);
        if (hex) {
          if (!ignored)
            text += new TextDecoder("windows-1252").decode(
              new Uint8Array([parseInt(hex[1], 16)]),
            );
          i += 3;
          continue;
        }
        if (input[i + 1] === "*") {
          ignored = true;
          i++;
          continue;
        }
        if (/[{}\\]/.test(input[i + 1] ?? "")) {
          if (!ignored) text += input[++i];
          continue;
        }
        const m = rest.match(/^\\([a-z]+)(-?\d+)? ?/i);
        if (m) {
          i += m[0].length - 1;
          const key = m[1];
          if (
            [
              "fonttbl",
              "colortbl",
              "stylesheet",
              "info",
              "pict",
              "object",
              "header",
              "footer",
            ].includes(key)
          )
            ignored = true;
          if (!ignored) {
            if (["par", "line"].includes(key)) text += "\n";
            else if (key === "tab") text += "\t";
            else if (key === "u") {
              text += String.fromCharCode(Number(m[2]) & 65535);
              skip = 1;
            }
          }
          continue;
        }
      }
      if (skip) {
        skip--;
        continue;
      }
      if (!ignored && c !== "\r" && c !== "\n") text += c;
    }
    html = text
      .split(/\n/)
      .map((p) => `<p>${escapeHTML(p)}</p>`)
      .join("");
  } else if (format === "md" || format === "markdown")
    html = await marked.parse(await file.text());
  else if (format === "html" || format === "htm") html = await file.text();
  else if (format === "mht" || format === "mhtml") {
    html = await renderMhtml(file);
  } else if (format === "txt") {
    const bytes = await file.arrayBuffer();
    const text = decodeText(new Uint8Array(bytes));
    html = text
      .split(/\n\s*\n/)
      .map((p) => `<p>${escapeHTML(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
  } else
    throw Error(
      `.${format.toUpperCase()} needs a format engine that is not included yet. EPUB, PDF, Kindle, comics, and text documents are supported.`,
    );
  return htmlBook(html, title);
}
export async function createBook(file: File): Promise<Book> {
  if (file.size > 256 * 1024 * 1024)
    throw Error("Please choose a book smaller than 256 MB.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const id = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  let title = file.name.replace(/\.[^.]+$/, ""),
    author = "Unknown author",
    cover = "";
  let series = "", seriesIndex: number | undefined;
  if (!["pdf", "djvu", "djv"].includes(ext(file.name))) {
    const engine = await makeEngineBook(file);
    try {
      title = textOf(engine.metadata?.title) || title;
      author = textOf(engine.metadata?.author) || author;
      const collection = engine.metadata?.belongsTo?.series;
      const entry = Array.isArray(collection) ? collection[0] : collection;
      series = textOf(entry?.name);
      if (entry?.position != null && Number.isFinite(Number(entry.position))) seriesIndex = Number(entry.position);
      const blob = await engine.getCover?.();
      if (blob)
        cover = await new Promise<string>((r) => {
          const fr = new FileReader();
          fr.onload = () => r(String(fr.result));
          fr.readAsDataURL(blob);
        });
    } finally {
      engine.destroy?.();
    }
  }
  return {
    id,
    sourceUri: (file as any).sourceUri,
    downloaded: !!(file as any).downloaded,
    title,
    author,
    series,
    seriesIndex,
    filename: file.name,
    format: ext(file.name),
    added: Date.now(),
    lastRead: 0,
    progress: 0,
    location: 0,
    cover,
    tags: [],
    favorite: false,
    rating: 0,
    finished: false,
    seconds: 0,
    words: 0,
    size: file.size,
    blob: file,
  };
}
/** Lightweight original jackets for books without publisher artwork. */
export function generatedCover(title: string, author: string) {
  const palettes = [
    ["#243b35", "#f5e7c8", "#b8c6aa"],
    ["#eadcc5", "#343a31", "#bc7150"],
    ["#793d3f", "#ffead8", "#d99b83"],
    ["#24354c", "#f4e9d5", "#a1b8c1"],
    ["#d1b375", "#302e2b", "#8c4238"],
    ["#4a3a56", "#f3e4d7", "#bfa7bd"],
  ];
  let hash = 2166136261;
  for (const char of `${title}::${author}`) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0;
  const [paper, ink, accent] = palettes[hash % palettes.length];
  const words = title.trim().split(/\s+/u).flatMap(word => {
    const chars = Array.from(word), parts: string[] = [];
    for (let i = 0; i < chars.length; i += 15) parts.push(chars.slice(i, i + 15).join(""));
    return parts;
  });
  const lines: string[] = [""];
  for (const word of words) {
    const last = lines.length - 1, next = `${lines[last]} ${word}`.trim();
    if (Array.from(next).length <= 15) lines[last] = next;
    else lines.push(word);
  }
  const visible = lines.slice(0, 5);
  if (lines.length > 5) visible[4] = visible[4].slice(0, 13) + "…";
  const authorLine = Array.from(author).slice(0, 29).join("") + (Array.from(author).length > 29 ? "…" : "");
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 420"><rect width="280" height="420" fill="${paper}"/><path d="M17 0v420" stroke="${ink}" opacity=".14"/><path d="M34 40h34" stroke="${ink}" stroke-width="2"/><text x="34" y="89" font-family="Georgia,serif" font-size="27" fill="${ink}">${visible.map((line,i)=>`<tspan x="34" dy="${i ? 34 : 0}">${escapeHTML(line)}</tspan>`).join("")}</text><path d="M34 270h212" stroke="${ink}" opacity=".3"/><circle cx="232" cy="320" r="80" fill="${accent}"/><circle cx="232" cy="320" r="54" fill="none" stroke="${paper}" stroke-width="1"/><rect y="363" width="280" height="57" fill="${paper}"/><text x="34" y="392" font-family="sans-serif" font-size="12" fill="${ink}">${escapeHTML(authorLine)}</text></svg>`
  );
}
