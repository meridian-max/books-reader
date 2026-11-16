import { unzipSync, strFromU8 } from "fflate";
import { escapeHTML as E } from "./types";
const mimeOf = (name: string) =>
  ({
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
  })[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
function dataURI(bytes: Uint8Array, mime: string) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return "data:" + mime + ";base64," + btoa(binary);
}
const xml = (source: string) => {
  const d = new DOMParser().parseFromString(source, "application/xml");
  if (d.querySelector("parsererror"))
    throw Error("The document contains invalid XML.");
  return d;
};
const attr = (el: Element, name: string) =>
  el.getAttribute(name) ??
  [...el.attributes].find((a) => a.localName === name.split(":").pop())
    ?.value ??
  "";
export async function renderDocx(file: File) {
  const { renderAsync } = await import("docx-preview");
  const body = document.createElement("div"),
    styles = document.createElement("div");
  await renderAsync(file, body, styles, {
    inWrapper: false,
    ignoreWidth: true,
    ignoreHeight: true,
    breakPages: false,
    ignoreLastRenderedPageBreak: true,
    useBase64URL: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderComments: false,
    experimental: true,
  });
  return `<html><head>${styles.innerHTML}<style>section.docx{width:auto!important;min-height:0!important;padding:0!important}table{max-width:100%;border-collapse:collapse}img,svg{max-width:100%}td,th{overflow-wrap:anywhere}</style></head><body>${body.innerHTML}</body></html>`;
}
export async function renderOdt(file: File) {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer())),
    content = files["content.xml"];
  if (!content) throw Error("The ODT has no content.xml.");
  const doc = xml(strFromU8(content));
  const styleDocs = [
    doc,
    ...(files["styles.xml"] ? [xml(strFromU8(files["styles.xml"]))] : []),
  ];
  const styles = new Map<string, { css: string; parent: string }>();
  const properties: Record<string, string> = {
    "font-size": "font-size",
    "font-weight": "font-weight",
    "font-style": "font-style",
    color: "color",
    "background-color": "background-color",
    "text-align": "text-align",
    "text-indent": "text-indent",
    "line-height": "line-height",
    "margin-left": "margin-left",
    "margin-right": "margin-right",
    "margin-top": "margin-top",
    "margin-bottom": "margin-bottom",
    padding: "padding",
    border: "border",
    "column-width": "width",
    "font-family": "font-family",
    "text-underline-style": "text-decoration",
  };
  for (const d of styleDocs)
    for (const style of d.getElementsByTagNameNS("*", "style")) {
      const name = attr(style, "style:name");
      let css = "";
      for (const child of style.children)
        for (const a of child.attributes) {
          const property = properties[a.localName];
          if (property && !/[{}<>]/.test(a.value))
            css +=
              property +
              ":" +
              (a.localName === "text-underline-style"
                ? a.value === "none"
                  ? "none"
                  : "underline"
                : a.value) +
              ";";
        }
      styles.set(name, { css, parent: attr(style, "style:parent-style-name") });
    }
  const getStyle = (name: string, depth = 0): string => {
    if (depth > 8) return "";
    const s = styles.get(name);
    return s ? getStyle(s.parent, depth + 1) + s.css : "";
  };
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return E(node.textContent);
    if (!(node instanceof Element)) return "";
    const name = node.localName,
      inside = () => [...node.childNodes].map(render).join(""),
      style = getStyle(
        attr(node, "text:style-name") ||
          attr(node, "table:style-name") ||
          attr(node, "draw:style-name"),
      ),
      css = style ? ` style="${E(style)}"` : "";
    if (name === "s")
      return "&nbsp;".repeat(Math.min(200, Number(attr(node, "text:c")) || 1));
    if (name === "tab") return "&#9;";
    if (name === "line-break") return "<br>";
    if (name === "image") {
      const path = attr(node, "xlink:href").replace(/^\.\//, "");
      return files[path]
        ? `<img alt="" src="${dataURI(files[path], mimeOf(path))}">`
        : "";
    }
    if (name === "a") {
      const href = attr(node, "xlink:href");
      return `<a href="${E(href)}"${css}>${inside()}</a>`;
    }
    if (name === "h") {
      const level = Math.min(
        6,
        Math.max(1, Number(attr(node, "text:outline-level")) || 2),
      );
      return `<h${level}${css}>${inside()}</h${level}>`;
    }
    if (
      [
        "p",
        "span",
        "table",
        "list",
        "list-item",
        "table-row",
        "table-cell",
        "table-column",
      ].includes(name)
    ) {
      const tag: Record<string, string> = {
        list: "ul",
        "list-item": "li",
        "table-row": "tr",
        "table-cell": "td",
        "table-column": "col",
      };
      const t = tag[name] ?? name;
      let attrs = css;
      if (t === "td") {
        const cols = Number(attr(node, "table:number-columns-spanned")),
          rows = Number(attr(node, "table:number-rows-spanned"));
        if (cols > 1) attrs += ` colspan="${Math.min(cols, 100)}"`;
        if (rows > 1) attrs += ` rowspan="${Math.min(rows, 100)}"`;
      }
      const repeated = Math.min(
        100,
        Math.max(1, Number(attr(node, "table:number-columns-repeated")) || 1),
      );
      return Array.from({ length: repeated }, () =>
        t === "col" ? `<col${attrs}>` : `<${t}${attrs}>${inside()}</${t}>`,
      ).join("");
    }
    if (
      ["tracked-changes", "annotation", "binary-data", "scripts"].includes(name)
    )
      return "";
    return inside();
  };
  const text = doc.getElementsByTagNameNS("*", "text")[0];
  if (!text) throw Error("This ODT contains no text document.");
  return `<html><head><style>table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #aaa;padding:.35em}img{max-width:100%}p{white-space:pre-wrap}</style></head><body>${render(text)}</body></html>`;
}
interface MimePart {
  headers: Record<string, string>;
  body: string;
}
function splitPart(input: string): MimePart {
  const match = /\r?\n\r?\n/.exec(input);
  if (!match) return { headers: {}, body: input };
  const headers: Record<string, string> = {};
  for (const line of input
    .slice(0, match.index)
    .replace(/\r?\n[ \t]+/g, " ")
    .split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0)
      headers[line.slice(0, colon).trim().toLowerCase()] = line
        .slice(colon + 1)
        .trim();
  }
  return { headers, body: input.slice(match.index + match[0].length) };
}
const parameter = (value: string, key: string) =>
  new RegExp("(?:^|;)\\s*" + key + '\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))', "i")
    .exec(value)
    ?.slice(1)
    .find(Boolean) ?? "";
function partBytes(part: MimePart) {
  const encoding = part.headers["content-transfer-encoding"]?.toLowerCase();
  let body = part.body.replace(/\r?\n$/, "");
  if (encoding === "base64")
    return Uint8Array.from(atob(body.replace(/\s/g, "")), (c) =>
      c.charCodeAt(0),
    );
  if (encoding === "quoted-printable")
    body = body
      .replace(/=\r?\n/g, "")
      .replace(/=([a-f0-9]{2})/gi, (_, n) =>
        String.fromCharCode(parseInt(n, 16)),
      );
  return Uint8Array.from(body, (c) => c.charCodeAt(0) & 255);
}
function partText(part: MimePart) {
  let charset =
    parameter(part.headers["content-type"] ?? "", "charset") || "utf-8";
  try {
    return new TextDecoder(charset).decode(partBytes(part));
  } catch {
    return new TextDecoder().decode(partBytes(part));
  }
}
export async function renderMhtml(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let source = "";
  for (let i = 0; i < bytes.length; i += 32768)
    source += String.fromCharCode(...bytes.subarray(i, i + 32768));
  const leaves: MimePart[] = [];
  const collect = (raw: string, depth = 0) => {
    if (depth > 12 || leaves.length > 10000)
      throw Error("The MHTML archive is too deeply nested.");
    const p = splitPart(raw),
      boundary = parameter(p.headers["content-type"] ?? "", "boundary");
    if (boundary) {
      for (const child of p.body.split("--" + boundary).slice(1)) {
        if (child.startsWith("--")) break;
        collect(child.replace(/^\r?\n/, ""), depth + 1);
      }
    } else leaves.push(p);
  };
  collect(source);
  const main = leaves.find((p) =>
    /text\/html|application\/xhtml\+xml/i.test(p.headers["content-type"] ?? ""),
  );
  if (!main) throw Error("The MHTML archive has no HTML document.");
  const base =
      main.headers["content-location"] || "https://mhtml.invalid/index.html",
    resources = new Map<string, MimePart>();
  const absolute = (href: string, relativeBase = base) => {
    try {
      return new URL(href, relativeBase).href;
    } catch {
      return href;
    }
  };
  for (const p of leaves) {
    const location = p.headers["content-location"],
      cid = p.headers["content-id"]?.replace(/^<|>$/g, "");
    if (location) {
      resources.set(location, p);
      resources.set(absolute(location), p);
    }
    if (cid) resources.set("cid:" + cid, p);
  }
  const find = (href: string, relativeBase = base) =>
    resources.get(href) || resources.get(absolute(href, relativeBase));
  const resource = (href: string, relativeBase = base) => {
    const p = find(href, relativeBase);
    if (!p) return "";
    const type = (p.headers["content-type"] ?? mimeOf(href)).split(";")[0];
    return /^(image|audio|video|font)\//.test(type) ||
      /application\/(?:font|x-font|vnd.ms-fontobject)/.test(type)
      ? dataURI(partBytes(p), type)
      : "";
  };
  const css = (text: string, relativeBase = base) =>
    text
      .replace(
        /url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi,
        (_, href) => `url("${resource(href, relativeBase)}")`,
      )
      .replace(/@import[^;]+;/gi, "");
  const doc = new DOMParser().parseFromString(partText(main), "text/html");
  for (const el of doc.querySelectorAll<HTMLElement>(
    "[src],[poster],[background]",
  ))
    for (const attr of ["src", "poster", "background"]) {
      const href = el.getAttribute(attr);
      if (!href) continue;
      const data = resource(href);
      if (data) el.setAttribute(attr, data);
      else if (!/^(data:|blob:)/i.test(href)) el.removeAttribute(attr);
    }
  for (const el of doc.querySelectorAll("link[rel=stylesheet]")) {
    const p = find(el.getAttribute("href") ?? "");
    if (p) {
      const style = doc.createElement("style");
      style.textContent = css(
        partText(p),
        absolute(
          p.headers["content-location"] || el.getAttribute("href") || base,
        ),
      );
      el.replaceWith(style);
    } else el.remove();
  }
  for (const el of doc.querySelectorAll("style"))
    el.textContent = css(el.textContent ?? "");
  for (const el of doc.querySelectorAll<HTMLElement>("[style]"))
    el.setAttribute("style", css(el.getAttribute("style") ?? ""));
  for (const el of doc.querySelectorAll("[srcset]"))
    el.removeAttribute("srcset");
  return doc.documentElement.outerHTML;
}
export function decodeText(bytes: Uint8Array, encoding = "auto") {
  if (encoding !== "auto") return new TextDecoder(encoding).decode(bytes);
  if (bytes[0] === 255 && bytes[1] === 254)
    return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 254 && bytes[1] === 255)
    return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
