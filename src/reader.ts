import {controlsSheet,rangeSteppers,searchableOptions} from "./reader-preferences";
import {backgroundPicker,readerBackground} from "./reader-backgrounds";
import {themeFilters, bindThemeFilters} from "./theme-studio";
import {voicePickerHTML,bindVoicePicker} from "./reader-voices";
import {readerSidebar} from "./reader-sidebar";
import {readerFonts,fontOptions,fontFaceCSS} from "./reader-fonts";
import {markerHighlight, highlightColors, textSelectionRange} from "./highlight-render";
import { processDocument } from "./text-processing";
import { ownsScrollInput } from "../vendor/foliate-js/scroll-input.js";
import { turnTransition } from "./transitions";
import { db } from "./db";
import { makeEngineBook, clean, foliate } from "./formats";
import {
  themes,
  defaults,
  uid,
  dateKey,
  escapeHTML as E,
  type Book,
  type Mark,
  type Settings,
} from "./types";
import {
  icon,
  button,
  modal,
  closeModal,
  toast,
  range,
  toggle,
  select,
  inputDialog,
  confirmDialog,
} from "./ui";
import {
  isNative,
  native,
  saveFile,
  share,
  network,
  writeOriginal,
} from "./native";
import { exportNotes, sync } from "./backup";
import { actionNames, eventNames, toolbarIcons, orientationNames, animationNames, tapEventAt } from "./controls";
import { exportReadwise } from "./readwise";

export class Reader {
  book: Book;
  settings: Settings;
  root: HTMLElement;
  view: any;
  engine: any;
  pdf?: Worker;
  page = 0;
  count = 0;
  toc: any[] = [];
  renderVersion = 0;
  currentText = "";
  pdfBounds: number[] = [];
  pdfText: any;
  zoom = 1;
  pen = false;
  pdfDirty = false;
  pdfURL = "";
  marks: Mark[] = [];
  selected: {
    quote: string;
    location: string | number;
    quads?: number[][];
    range?: Range;
    markId?: string;
  } | null = null;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setInterval>;
  private autoTimer?: number;
  private lastFixedPage = -1;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private saveIdle?: number;
  private lastFlushAt = performance.now();
  private lastFlushedSeconds = 0;
  private styledRenderer: any;
  private reflowStyle = "";
  private nativeSettings = new Map<string, string>();
  private clockFormat = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  private sleepTimer?: ReturnType<typeof setTimeout>;
  private activeAt = performance.now();
  private sessionId = uid();
  private sessionDate = dateKey();
  private sessionSeconds = 0;
  private sessionWords = 0;
  private visited = new Set<string>();
  private closing = false;
  private turning = false;
  private nativeVisible = true;
  private speaking = false;
  private nativeSpeechQueue = false;
  private paused = false;
  private selectionStyle = "Highlight";
  private selectionTimer?: ReturnType<typeof setTimeout>;
  private savingHighlight = false;
  private navigationHistory: {
    location: string | number;
    viewport?: { offset: number; section: number; layout: string };
  }[] = [];
  private navigatingBack = false;
  private speechOverlay: any;
  private browserSpeech: {text:string;start:number}[] = [];
  private browserSpeechIndex = 0;
  private speechGeneration = 0;
  private speechTextCache?: {doc:Document;source:string;nodes:{node:Node;start:number;end:number}[];sentence:string;index:number};
  private highlightDraw: any;
  private ttsSleepAt = 0;
  private lastInteraction = Date.now();
  private currentSection = 0;
  private pdfRpcId = 0;
  private rpcWaiting = new Map<
    number,
    { resolve: (x: any) => void; reject: (e: Error) => void }
  >();
  constructor(
    book: Book,
    settings: Settings,
    private onClose: () => void,
  ) {
    this.book = book;
    this.settings = settings;
    this.selectionStyle = settings.highlightStyle;
    this.root = document.querySelector("#reader")!;
  }
  async open() {
    document.body.classList.add("reading");
    this.root.hidden = false;
    this.root.innerHTML = `<header class="reader-header"><div class="reader-heading">${button("back", "Back to library", "exit")}<div><h1>${E(this.book.title)}</h1></div></div><div class="reader-top-actions"><button class="reader-flow-button" data-action="toggle-flow" hidden></button>${button("bookmark", "Add bookmark", "bookmark")}${button("more", "More reading options", "more")}</div></header>
      <div id="book-viewport"><div class="loading-reader"><span class="spinner"></span>Opening book…</div></div><div id="reading-ruler" hidden></div><div id="blue-light"></div><div id="selection-tools" role="toolbar" aria-label="Text selection" hidden></div>
      <footer class="reader-footer"><div class="reader-position"><span id="chapter-name">${E(this.book.author)}</span></div><div class="reader-progress-row">${button("back", "Previous page", "previous")}<input id="reading-progress" aria-label="Reading progress" type="range" min="0" max="1" step=".001" value="${this.book.progress}"><button id="reader-percent" data-action="contents" aria-label="Go to position">${Math.round(this.book.progress * 100)}%</button><span id="reader-pages"></span><button class="icon-button" data-action="jump-back" aria-label="Return to previous position" disabled>${icon("rotate", 20)}</button>${button("arrow", "Next page", "next")}</div><nav class="reader-toolbar" aria-label="Reading tools"></nav></footer>
      <div class="reader-mini-status" hidden><span class="status-custom"></span><span class="status-clock"></span><span class="status-title">${E(this.book.title)}</span><span class="status-percent">${Math.round(this.book.progress * 100)}%</span></div><button class="reader-reveal icon-button" data-action="toolbar" aria-label="Show reading controls">${icon("menu")}</button>`;
    this.renderToolbar();
    const mini=this.root.querySelector<HTMLElement>('.reader-mini-status')!;
    for(const side of ['Left','Center','Right']) {
      const b=document.createElement('button');b.className='mini-zone';b.dataset.miniZone=side;b.setAttribute('aria-label','Mini status '+side.toLowerCase());
      let timer:ReturnType<typeof setTimeout>|undefined,held=false,x=0,y=0;
      b.onpointerdown=e=>{held=false;x=e.clientX;y=e.clientY;timer=setTimeout(()=>{held=true;this.eventAction('miniLong'+side)},this.settings.longPressDelay);};
      b.onpointermove=e=>{if(Math.hypot(e.clientX-x,e.clientY-y)>12)clearTimeout(timer);};
      b.onpointerup=b.onpointercancel=b.onpointerleave=()=>clearTimeout(timer);
      b.onclick=()=>{if(!held)this.eventAction('mini'+side);};this.abort.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});mini.append(b);
    }

    this.root.classList.toggle("controls-hidden", this.settings.fullscreen);
    this.root.querySelector<HTMLElement>(".reader-mini-status")!.hidden =
      !this.settings.fullscreen;
    const signal = this.abort.signal;
    this.root
      .querySelector("#selection-tools")!
      .addEventListener("mousedown", (event) => event.preventDefault(), {
        signal,
      });
    this.root.addEventListener(
      "click",
      (e) => {
        const a = (e.target as Element).closest<HTMLElement>("[data-action]")
          ?.dataset.action;
        if (a) this.perform(a).catch((e) => toast(e.message, true));
      },
      { signal },
    );
    this.root
      .querySelector("#reading-progress")!
      .addEventListener(
        "change",
        (e) => this.goFraction(Number((e.target as HTMLInputElement).value)),
        { signal },
      );
    document.addEventListener("keydown", this.key, { signal });
    for (const name of [
      "key",
      "back",
      "shake",
      "tilt",
      "pause",
      "resume",
      "speech",
    ])
      window.addEventListener(
        "native:" + name,
        this.nativeEvent as EventListener,
        { signal },
      );
    document.addEventListener(
      "visibilitychange",
      () => {
        this.activeAt = performance.now();
        if (document.hidden) this.flush().catch(console.error);
      },
      { signal },
    );
    document.addEventListener(
      "pointerdown",
      () => {
        this.lastInteraction = Date.now();
      },
      { signal },
    );
    if (isNative() && this.settings.autoSync) {
      const cloud = await native("getCloud");
      if (cloud) {
        try {
          await sync();
          this.book = (await db.book(this.book.id)) ?? this.book;
        } catch (error) {
          toast("Cloud sync unavailable; reading local copy.");
        }
      }
    }
    this.marks = await db.marks(this.book.id);
    this.book.lastRead = Date.now();
    await db.putBook(this.book);
    try {
      if (["pdf", "djvu", "djv"].includes(this.book.format))
        await this.openPDF();
      else await this.openReflow();
      this.timer = setInterval(() => this.tick(), 1000);
      this.applySettings();
    } catch (e) {
      await this.close();
      throw e;
    }
  }
  private async openReflow() {
    await foliate();
    this.engine = await makeEngineBook(
      new File([this.book.blob], this.book.filename),
    );
    this.toc = this.engine.toc ?? [];
    this.engine.transformTarget?.addEventListener("data", (e: any) => {
      const d = e.detail;
      if (/html|xml/.test(d.type))
        d.data = Promise.resolve(d.data).then(async (data: any) => {
          let html = typeof data === "string" ? data : await data.text();
          html = clean(html);
          const processed = new DOMParser().parseFromString(html, "text/html");
          processDocument(processed, this.settings);
          html = processed.documentElement.outerHTML;
          if (/xml/i.test(d.type)) {
            const xmlDoc = new DOMParser().parseFromString(html, "text/html");
            html = new XMLSerializer().serializeToString(xmlDoc);
          }
          return typeof data === "string"
            ? html
            : new Blob([html], { type: d.type });
        });
    });
    this.view = document.createElement("foliate-view");
    this.view.addEventListener("load", (e: any) =>
      this.attachDocument(e.detail.doc, e.detail.index),
    );
    this.view.addEventListener("relocate", (e: any) => {
      const d = e.detail;
      this.book.progress = Number.isFinite(d.fraction)
        ? Math.max(0, Math.min(1, d.fraction))
        : this.book.progress;
      this.book.location = d.cfi;
      this.currentSection = d.section?.current ?? this.currentSection;
      this.currentText = d.range?.toString() ?? "";
      this.updatePosition(d.tocItem?.label ?? this.book.title);
      this.countWords(d.cfi, this.currentText);
      this.scheduleSave();
    });
    const overlayPath = "/foliate/overlayer.js";
    const { Overlayer } = await import(/* @vite-ignore */ overlayPath);
    this.highlightDraw = markerHighlight;
    this.view.addEventListener("draw-annotation", (e: any) =>
      e.detail.draw(
        e.detail.annotation.style === "Underline"
          ? Overlayer.underline
          : e.detail.annotation.style === "Squiggly"
            ? (Overlayer.squiggly ?? Overlayer.underline)
            : e.detail.annotation.style === "StrikeOut"
              ? (Overlayer.strikethrough ?? Overlayer.underline)
              : markerHighlight,
        { color: e.detail.annotation.color, writingMode: e.detail.doc?.defaultView.getComputedStyle(e.detail.doc.body).writingMode },
      ),
    );
    this.view.addEventListener("create-overlay", () => {
      for (const m of this.marks)
        if (m.type !== "bookmark")
          this.view.addAnnotation({
            value: m.location,
            color: m.color,
            style: m.style,
          });
    });
    this.view.addEventListener("show-annotation", (e: any) => {
      const m = this.marks.find((m) => m.location === e.detail.value);
      if (m && !this.savingHighlight && !document.querySelector(".modal")) {
        this.selected = {
          quote: m.quote,
          location: m.location,
          range: e.detail.range,
          markId: m.id,
        };
        this.selectionStyle = m.style ?? "Highlight";
        this.showSelection();
      }
    });
    this.view.addEventListener("external-link", (e: any) => {
      e.preventDefault();
      if (/^https?:/.test(e.detail.href))
        window.open(e.detail.href, "_blank", "noopener");
    });
    this.view.addEventListener("link", (e: any) => {
      const { a, href } = e.detail;
      if (
        a?.getAttribute("epub:type")?.includes("noteref") ||
        a?.getAttribute("role") === "doc-noteref"
      ) {
        e.preventDefault();
        Promise.resolve(this.engine.resolveHref(href))
          .then(async (r: any) => {
            const doc = await this.engine.sections[r.index].createDocument();
            const note = r.anchor(doc);
            if (note)
              modal(
                "Footnote",
                `<div class="footnote-content">${clean(note.innerHTML ?? note.textContent)}</div>`,
              );
          })
          .catch(() => this.view.goTo(href));
      }
    });
    this.root.querySelector("#book-viewport")!.replaceChildren(this.view);
    await this.view.open(this.engine);
    this.applySettings();
    await this.view.init({
      lastLocation: this.book.location || undefined,
      showTextStart: !this.book.location,
    });
  }
  private async openPDF() {
    this.pdf = new Worker(
      this.book.format === "pdf" ? "/pdf-worker.js" : "/djvu-worker.js",
      { type: "module" },
    );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("The document engine did not become ready.")),
        20000,
      );
      this.pdf!.onmessage = ({ data }) => {
        if (data.ready) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        const p = this.rpcWaiting.get(data.id);
        if (!p) return;
        this.rpcWaiting.delete(data.id);
        data.ok ? p.resolve(data.data) : p.reject(Error(data.error));
      };
      this.pdf!.onerror = (e) => {
        clearTimeout(timeout);
        reject(Error(e.message || "The document engine failed."));
        for (const p of this.rpcWaiting.values())
          p.reject(Error(e.message || "The document engine failed."));
        this.rpcWaiting.clear();
      };
    });
    let meta = await this.rpc("open", {
      buffer: await this.book.blob.arrayBuffer(),
    });
    if (meta.password) {
      const password = await inputDialog(
        "Password-protected PDF",
        "Enter the document password",
        "",
        "password",
      );
      if (password === null) throw Error("Opening cancelled.");
      meta = await this.rpc("open", {
        buffer: await this.book.blob.arrayBuffer(),
        password,
      });
      if (meta.password) throw Error("The PDF password was not accepted.");
    }
    this.count = meta.count;
    this.toc = meta.toc;
    this.page =
      typeof this.book.location === "number"
        ? Math.min(this.count - 1, this.book.location)
        : 0;
    const viewport = this.root.querySelector<HTMLElement>("#book-viewport")!;
    let distance = 0,
      startZoom = 1,
      nextZoom = 1;
    viewport.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length === 2) {
          event.preventDefault();
          distance = Math.hypot(
            event.touches[0].clientX - event.touches[1].clientX,
            event.touches[0].clientY - event.touches[1].clientY,
          );
          startZoom = this.zoom;
          nextZoom = startZoom;
        }
      },
      { passive: false, signal: this.abort.signal },
    );
    viewport.addEventListener(
      "touchmove",
      (event) => {
        if (distance && event.touches.length === 2) {
          event.preventDefault();
          nextZoom = Math.max(
            0.75,
            Math.min(
              4,
              (startZoom *
                Math.hypot(
                  event.touches[0].clientX - event.touches[1].clientX,
                  event.touches[0].clientY - event.touches[1].clientY,
                )) /
                distance,
            ),
          );
          const spread = viewport.querySelector<HTMLElement>(".pdf-spread");
          if (spread) {
            spread.style.transformOrigin = "top center";
            spread.style.transform = `scale(${nextZoom / startZoom})`;
          }
        }
      },
      { passive: false, signal: this.abort.signal },
    );
    viewport.addEventListener(
      "touchend",
      () => {
        if (distance) {
          distance = 0;
          this.zoom = nextZoom;
          this.renderPDF();
        }
      },
      { signal: this.abort.signal },
    );
    await this.renderPDF();
  }
  private rpc(method: string, args: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.pdfRpcId;
      this.rpcWaiting.set(id, { resolve, reject });
      this.pdf!.postMessage({ id, method, args });
    });
  }
  private async renderPDF() {
    const version = ++this.renderVersion;
    const viewport = this.root.querySelector<HTMLElement>("#book-viewport")!;
    const width =
      Math.min(Math.max(320, viewport.clientWidth - 32), 1200) *
      Math.min(devicePixelRatio, 2) *
      this.zoom;
    const pages =
      this.settings.columns === 2 &&
      innerWidth > 700 &&
      this.page + 1 < this.count
        ? [this.page, this.page + 1]
        : [this.page];
    const rendered = await Promise.all(
      pages.map((page) =>
        this.rpc("render", { page, width: width / pages.length }),
      ),
    );
    if (this.closing || version !== this.renderVersion) return;
    if (this.pdfURL) URL.revokeObjectURL(this.pdfURL);
    viewport.innerHTML = '<div class="pdf-spread"></div>';
    const spread = viewport.querySelector(".pdf-spread")!;
    for (let j = 0; j < rendered.length; j++) {
      const r = rendered[j],
        page = pages[j];
      const url = URL.createObjectURL(new Blob([r.png], { type: "image/png" }));
      this.pdfURL = url;
      const [x0, y0, x1, y1] = r.bounds;
      const cssWidth =
        (Math.min(viewport.clientWidth - 32, 1100) / pages.length) * this.zoom;
      const scale = cssWidth / (x1 - x0);
      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page";
      wrapper.style.cssText = `width:${cssWidth}px;height:${(y1 - y0) * scale}px`;
      wrapper.innerHTML = `<img alt="Page ${page + 1}" src="${url}" draggable="false"><div class="pdf-text-layer"></div><canvas class="pdf-ink" width="${Math.ceil(cssWidth)}" height="${Math.ceil((y1 - y0) * scale)}"></canvas><div class="pdf-forms"></div>`;
      wrapper
        .querySelector("img")!
        .addEventListener("load", () => URL.revokeObjectURL(url), {
          once: true,
        });
      const layer = wrapper.querySelector<HTMLElement>(".pdf-text-layer")!;
      const texts: string[] = [];
      for (const block of r.text.blocks ?? [])
        for (const line of block.lines ?? []) {
          if (!line.text) continue;
          const bbox = line.bbox;
          const b = Array.isArray(bbox)
            ? bbox
            : [
                bbox?.x,
                bbox?.y,
                (bbox?.x ?? 0) + (bbox?.w ?? 0),
                (bbox?.y ?? 0) + (bbox?.h ?? 0),
              ];
          const span = document.createElement("span");
          span.textContent = line.text;
          span.style.cssText = `left:${(b[0] - x0) * scale}px;top:${(b[1] - y0) * scale}px;width:${(b[2] - b[0]) * scale}px;height:${(b[3] - b[1]) * scale}px;font-size:${Math.max(8, (line.font?.size ?? 12) * scale)}px`;
          layer.append(span);
          texts.push(line.text);
        }
      if (j === 0) {
        this.pdfBounds = r.bounds;
        this.pdfText = r.text;
        this.currentText = r.plainText ?? texts.join("\n");
      }
      if (this.book.format !== "pdf") {
        const marks = this.marks;
        for (const mark of marks.filter(
          (m: Mark) => !m.deleted && m.location === page,
        ))
          for (const q of mark.quads ?? []) {
            const el = document.createElement("div");
            el.className = "fixed-mark";
            const left = Math.min(q[0], q[2], q[4], q[6]),
              top = Math.min(q[1], q[3], q[5], q[7]),
              right = Math.max(q[0], q[2], q[4], q[6]),
              bottom = Math.max(q[1], q[3], q[5], q[7]);
            el.style.cssText = `position:absolute;pointer-events:none;left:${left * 100}%;top:${top * 100}%;width:${(right - left) * 100}%;height:${(bottom - top) * 100}%;background:${mark.color};opacity:.32;z-index:2`;
            wrapper.append(el);
          }
      }
      this.attachDocument(wrapper.ownerDocument, page, layer);
      layer.addEventListener("pointerup", () =>
        setTimeout(() => this.pdfSelection(wrapper, page, scale, x0, y0), 50),
      );
      for (const w of r.widgets) {
        const form = document.createElement(
          w.options?.length ? "select" : "input",
        ) as HTMLInputElement | HTMLSelectElement;
        form.className = "pdf-form-field";
        form.setAttribute("aria-label", w.name || "PDF form field");
        const b = w.bounds;
        form.style.cssText = `left:${(b[0] - x0) * scale}px;top:${(b[1] - y0) * scale}px;width:${(b[2] - b[0]) * scale}px;height:${(b[3] - b[1]) * scale}px`;
        if (form instanceof HTMLSelectElement)
          for (const opt of w.options) form.add(new Option(opt, opt));
        if (form instanceof HTMLInputElement && /check|radio/i.test(w.type)) {
          form.type = "checkbox";
          form.checked = w.value !== "Off";
        } else form.value = w.value ?? "";
        form.disabled = w.readonly;
        form.addEventListener("change", () =>
          this.rpc("field", { page, index: w.i, value: form.value })
            .then(() => this.savePDF())
            .catch((e) => toast(e.message, true)),
        );
        wrapper.querySelector(".pdf-forms")!.append(form);
      }
      const canvas = wrapper.querySelector<HTMLCanvasElement>("canvas")!;
      canvas.classList.toggle("active", this.pen);
      let points: number[][] = [];
      let drawing = false;
      canvas.addEventListener("pointerdown", (e) => {
        if (!this.pen) return;
        drawing = true;
        points = [];
        canvas.setPointerCapture(e.pointerId);
        const c = canvas.getContext("2d")!;
        c.strokeStyle = "#b64a3c";
        c.lineWidth = 2;
        c.beginPath();
        const b = canvas.getBoundingClientRect();
        c.moveTo(e.clientX - b.left, e.clientY - b.top);
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        const b = canvas.getBoundingClientRect(),
          x = e.clientX - b.left,
          y = e.clientY - b.top;
        canvas.getContext("2d")!.lineTo(x, y);
        canvas.getContext("2d")!.stroke();
        points.push([x / scale + x0, y / scale + y0]);
      });
      canvas.addEventListener("pointerup", async () => {
        if (!drawing) return;
        drawing = false;
        if (points.length > 1) {
          await this.rpc("annotate", {
            page,
            type: "Ink",
            points,
            color: [0.72, 0.29, 0.24],
          });
          await this.savePDF();
        }
      });
      spread.append(wrapper);
    }
    if (this.lastFixedPage !== this.page) {
      viewport.scrollTop = 0;
      this.lastFixedPage = this.page;
    }
    this.book.location = this.page;
    this.book.progress = this.count === 1 ? 1 : this.page / (this.count - 1);
    this.updatePosition(`Page ${this.page + 1} of ${this.count}`);
    this.countWords("pdf:" + this.page, this.currentText);
    this.scheduleSave();
    this.applyPDFFilter();
  }
  private pdfSelection(
    wrapper: HTMLElement,
    page: number,
    scale: number,
    x0: number,
    y0: number,
  ) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.toString().trim()) return;
    const r = sel.getRangeAt(0);
    if (!wrapper.contains(r.commonAncestorContainer)) return;
    const b = wrapper.getBoundingClientRect();
    const quads = Array.from(r.getClientRects())
      .filter((r) => r.width && r.height)
      .map((r) => [
        (r.left - b.left) / scale + x0,
        (r.top - b.top) / scale + y0,
        (r.right - b.left) / scale + x0,
        (r.top - b.top) / scale + y0,
        (r.left - b.left) / scale + x0,
        (r.bottom - b.top) / scale + y0,
        (r.right - b.left) / scale + x0,
        (r.bottom - b.top) / scale + y0,
      ]);
    this.selected = { quote: sel.toString(), location: page, quads };
    this.showSelection();
  }
  private attachDocument(doc: Document, index: number, target?: HTMLElement) {
    const root = target ?? doc;
    if (!target && !this.engine.transformTarget)
      processDocument(doc, this.settings);
    const signal = this.abort.signal;
    this.currentSection = index;
    if (!target) {
      doc.addEventListener("keydown", this.key, { signal });
      doc.addEventListener(
        "pointerdown",
        () => {
          this.lastInteraction = Date.now();
        },
        { signal },
      );
      const captureSelection = () => {
        clearTimeout(this.selectionTimer);
        this.selectionTimer = setTimeout(() => {
          if (this.closing || this.speaking || !doc.defaultView) return;
          const selection = doc.defaultView.getSelection();
          if (
            !selection?.rangeCount ||
            selection.isCollapsed ||
            !selection.toString().trim()
          ) {
            if (
              !this.selected?.markId &&
              !document.querySelector(".modal") &&
              !this.savingHighlight
            ) {
              this.selected = null;
              this.root.querySelector<HTMLElement>("#selection-tools")!.hidden =
                true;
            }
            return;
          }
          if (document.querySelector(".modal")) return;
          const range = textSelectionRange(selection.getRangeAt(0));
          const location = this.view.getCFI(index, range);
          if (
            this.selected?.location === location &&
            !this.root.querySelector<HTMLElement>("#selection-tools")!.hidden
          )
            return;
          this.selected = {
            quote: selection.toString().slice(0, 20000),
            location,
            range: range.cloneRange(),
            markId: this.marks.find(
              (m) => m.type !== "bookmark" && m.location === location,
            )?.id,
          };
          this.showSelection();
        }, 100);
      };
      // Android's native long-press/selection handles can change the range
      // without delivering pointerup to the iframe.
      doc.addEventListener("selectionchange", captureSelection, { signal });
      doc.addEventListener("pointerup", captureSelection, { signal });
    }
    let startX = 0,
      startY = 0,
      startAt = 0,
      brightness = false,
      gestureActive = false,
      gestureTarget: EventTarget | null = null;
    type Gesture = Pick<PointerEvent, "clientX" | "clientY" | "target" | "pointerType">;
    const startGesture = (e: Gesture) => {
      gestureActive = false;
      if (document.querySelector(".modal")) return;
      gestureActive = true;
      startX = e.clientX;
      startY = e.clientY;
      startAt = Date.now();
      gestureTarget = e.target;
      brightness = startX < 20;
    };
    const finishGesture = (e: Gesture) => {
      if (!gestureActive) return;
      gestureActive = false;
      const selection = doc.defaultView?.getSelection();
      if (selection?.toString().trim()) return;
      if (document.querySelector(".modal")) return;
      const selectionTools =
        this.root.querySelector<HTMLElement>("#selection-tools")!;
      if (!selectionTools.hidden) {
        selectionTools.hidden = true;
        this.selected = null;
        return;
      }
      const dx = e.clientX - startX,
        dy = e.clientY - startY;
      if (ownsScrollInput(gestureTarget, Math.abs(dx) >= Math.abs(dy), target)) return;
      if (brightness && Math.abs(dy) > 30) {
        this.settings.brightness = Math.max(
          0.02,
          Math.min(1, this.settings.brightness - dy / 500),
        );
        this.applySettings();
        this.persistSettings();
        return;
      }
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy)) {
        const mapped=this.settings.eventActions[dx<0?"swipeLeft":"swipeRight"];
        if(!this.settings.horizontalFling&&["next","previous"].includes(mapped))return;
        // Foliate owns native slide dragging. Handling the same gesture here
        // also used to turn a second page while its snap was still running.
        if (
          !target &&
          e.pointerType === "touch" &&
          this.settings.flow === "paginated" &&
          !this.view?.renderer?.hasAttribute("manual-touch")
        )
          return;
        this.eventAction(dx < 0 ? "swipeLeft" : "swipeRight");
        return;
      }
      if (Math.abs(dy) > 80 && (this.settings.flow !== "scrolled" || this.settings.disableVerticalScroll)) {
        this.eventAction(dy < 0 ? "swipeUp" : "swipeDown");
        return;
      }
      if (Date.now() - startAt > this.settings.longPressDelay && Math.abs(dx) <= 15 && Math.abs(dy) <= 15) {
        this.eventAction("longPress");
        return;
      }
      if (
        Date.now() - startAt > 400 ||
        Math.abs(dx) > 15 ||
        Math.abs(dy) > 15
      )
        return;
      if ((e.target as Element)?.closest("a,button,input,video,audio"))
        return;
      if (!target) {
        const content = this.view?.renderer
          ?.getContents()
          .find((item: any) => item.doc === doc);
        const [value] =
          content?.overlayer?.hitTest({ x: e.clientX, y: e.clientY }) ?? [];
        if (this.marks.some((mark) => mark.location === value)) return;
      }
      const width = target?.clientWidth ?? doc.documentElement.clientWidth;
      // iframe coordinates include the document's scroll offset in scrolled flow.
      const frameRect=doc.defaultView?.frameElement?.getBoundingClientRect();
      const viewRect=this.root.querySelector('#book-viewport')!.getBoundingClientRect();
      const localY=target ? e.clientY-target.getBoundingClientRect().top : e.clientY+(frameRect?.top??0)-viewRect.top;
      this.eventAction(tapEventAt(this.settings.tapLayout,e.clientX/width,localY/(target?.clientHeight??viewRect.height)));

    };
    // Chromium cancels Pointer Events when it takes over a native pan. Touch
    // Events still deliver the release, as in Foliate/Readest's swipe handler.
    // Use one input path per gesture so a release can never turn two pages.
    root.addEventListener("pointerdown", ((e: PointerEvent) => {
      if (target || e.pointerType !== "touch") startGesture(e);
    }) as EventListener, { signal });
    root.addEventListener("pointerup", ((e: PointerEvent) => {
      if (target || e.pointerType !== "touch") finishGesture(e);
    }) as EventListener, { signal });
    root.addEventListener("pointercancel", ((e: PointerEvent) => {
      if (target || e.pointerType !== "touch") gestureActive = false;
    }) as EventListener, { signal });
    root.addEventListener("touchstart", ((e: TouchEvent) => {
      if (target) return;
      gestureActive = false;
      const touch = e.changedTouches[0];
      if (e.touches.length === 1 && touch) startGesture({
        clientX: touch.clientX, clientY: touch.clientY, target: e.target, pointerType: "touch",
      });
    }) as EventListener, { passive: true, signal });
    root.addEventListener("touchmove", ((e: TouchEvent) => {
      if (target) return;
      if (e.touches.length !== 1) gestureActive = false;
    }) as EventListener, { passive: true, signal });
    root.addEventListener("touchend", ((e: TouchEvent) => {
      if (target) return;
      const touch = e.changedTouches[0];
      if (e.touches.length || !touch) { gestureActive = false; return; }
      finishGesture({clientX: touch.clientX, clientY: touch.clientY, target: e.target, pointerType: "touch"});
    }) as EventListener, { passive: true, signal });
    root.addEventListener("touchcancel", () => { if (!target) gestureActive = false; }, { passive: true, signal });
    root.addEventListener(
      "dblclick",
      ((event: MouseEvent) => {
        const image = (event.target as Element)?.closest<HTMLImageElement>(
          "img",
        );
        if (this.settings.doubleTapZoom && this.pdf) {
          this.zoom = this.zoom > 1 ? 1 : 2;
          this.renderPDF();
        } else if (this.settings.doubleTapZoom && image)
          this.imageViewer(image.src);
        else this.eventAction("doubleTap");
      }) as EventListener,
      { signal },
    );
  }
  private key = (e: KeyboardEvent) => {
    if (
      (e.target as Element)?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])') ||
      document.querySelector(".modal")
    )
      return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault();
      this.perform("next");
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      this.perform("previous");
    } else if (e.key === "Escape") {
      if (this.selected) this.clearSelection();
      else this.perform("toolbar");
    }
    else if (e.key === "b") this.perform("bookmark");
    else if (e.key === "t") this.perform("appearance");
    else if (e.key === "f") {
      e.preventDefault();
      this.perform("search");
    }
  };
  private nativeEvent = (e: CustomEvent) => {
    if (e.type === "native:speech") {
      this.speechEvent(e.detail);
      return;
    }
    if (e.type === "native:back") {
      if (document.querySelector(".modal")) closeModal();
      else this.eventAction("back");
    } else if (e.type === "native:key") {
      if(document.querySelector('.modal'))return;
      if(String(e.detail).startsWith('custom:')){const action=this.settings.hardwareKeys[String(e.detail).slice(7)];if(action&&action!=='none')void this.perform(action);return;}
      this.eventAction(
        e.detail === "volume-up"
          ? "volumeUp"
          : e.detail === "volume-down"
            ? "volumeDown"
            : e.detail,
      );
    } else if (e.type === "native:shake" && this.settings.shakeAction!=='none'&&!document.querySelector('.modal')) void this.perform(this.settings.shakeAction);
    else if (e.type === "native:tilt" && this.settings.tiltPages)
      this.perform(e.detail);
    else if (e.type === "native:pause") {
      this.nativeVisible = false;
      this.activeAt = performance.now();
      this.flush()
        .then(() => (isNative() ? native("getCloud") : null))
        .then((c) => c && sync())
        .catch(() => {});
    } else if (e.type === "native:resume") {
      this.nativeVisible = true;
      this.activeAt = performance.now();
    }
  };
  private countWords(location: string, text: string) {
    if (this.visited.has(location)) return;
    this.visited.add(location);
    this.sessionWords += text.match(/\S+/g)?.length ?? 0;
  }
  private tick() {
    const now = performance.now();
    if (dateKey() !== this.sessionDate) {
      this.flush();
      this.sessionId = uid();
      this.sessionDate = dateKey();
      this.sessionSeconds = 0;
      this.sessionWords = 0;
      this.lastFlushedSeconds = 0;
      this.visited.clear();
    }
    this.updateMiniStatus();
    this.setStatusText(".status-clock", this.clockFormat.format(new Date()));
    if (
      !document.hidden &&
      this.nativeVisible &&
      Date.now() - this.lastInteraction < 5 * 60 * 1000
    ) {
      const seconds = Math.min(2, (now - this.activeAt) / 1000);
      this.sessionSeconds += seconds;
      this.book.seconds += seconds;
      if (
        this.settings.eyeReminder &&
        this.sessionSeconds > 0 &&
        Math.floor(this.sessionSeconds) % (this.settings.eyeReminder * 60) === 0
      )
        toast("Time for a short eye break. Look into the distance.");
    }
    this.activeAt = now;
    if (
      this.sessionSeconds > this.lastFlushedSeconds &&
      now - this.lastFlushAt >= 15000
    )
      this.flush().catch(console.error);
  }
  private scheduleSave() {
    if (this.closing) return;
    clearTimeout(this.saveTimer);
    if (this.saveIdle !== undefined) cancelIdleCallback(this.saveIdle);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      if ("requestIdleCallback" in window)
        this.saveIdle = requestIdleCallback(
          () => {
            this.saveIdle = undefined;
            this.flush().catch(console.error);
          },
          { timeout: 2000 },
        );
      else this.flush().catch(console.error);
    }, 1000);
  }
  async flush() {
    if (!this.book) return;
    this.view?.renderer?.reportLocation?.();
    this.lastFlushAt = performance.now();
    this.lastFlushedSeconds = this.sessionSeconds;
    this.book.lastRead = Date.now();
    const book = { ...this.book },
      session = {
        id: this.sessionId,
        bookId: this.book.id,
        date: this.sessionDate,
        seconds: Math.round(this.sessionSeconds),
        words: this.sessionWords,
      };
    await Promise.all([db.putBook(book), db.putSession(session)]);
  }
  private setStatusText(selector: string, text: string) {
    const node = this.root.querySelector(selector);
    if (node && node.textContent !== text) node.textContent = text;
  }
  private updatePosition(chapter: string) {
    this.setStatusText("#chapter-name", chapter);
    const percent = `${(this.book.progress * 100).toFixed(1)}%`;
    const location = this.view?.lastLocation?.location;
    this.setStatusText("#reader-pages", this.pdf ? `(${this.page + 1}/${this.count})` : location?.total ? `(${location.current + 1}/${location.total})` : "");
    this.setStatusText("#reader-percent", percent);
    this.setStatusText(".status-percent", percent);
    this.setStatusText(".status-clock", this.clockFormat.format(new Date()));
    this.updateMiniStatus();
    const p = this.root.querySelector<HTMLInputElement>("#reading-progress")!;
    p.value = String(this.book.progress);
    p.style.setProperty("--progress", `${this.book.progress * 100}%`);
  }
  private rememberPosition() {
    const renderer = this.view?.renderer;
    renderer?.reportLocation?.();
    const position = this.book.location;
    if (!this.navigatingBack && position !== undefined && position !== this.navigationHistory.at(-1)?.location) {
      this.navigationHistory.push({
        location: position,
        viewport: renderer?.scrolled ? {
          offset: renderer.start,
          section: renderer.getContents()[0].index,
          layout: this.readingLayout(),
        } : undefined,
      });
      if (this.navigationHistory.length > 20) this.navigationHistory.shift();
      this.root.querySelector<HTMLButtonElement>('[data-action="jump-back"]')!.disabled = false;
    }
  }
  private readingLayout() {
    const r = this.view?.renderer;
    return JSON.stringify([this.reflowStyle, r?.scrollProp, r?.size, r?.viewSize,
      r?.getAttribute("margin"), r?.getAttribute("gap")]);
  }
  async go(location: string | number) {
    if (location !== this.book.location) this.rememberPosition();
    if (this.pdf) {
      this.page = Math.min(this.count - 1, Math.max(0, Number(location) || 0));
      await this.renderPDF();
    } else await this.view.goTo(location);
  }
  private async goFraction(f: number) {
    if (!Number.isFinite(f)) return;
    f = Math.max(0, Math.min(1, f));
    if (Math.abs(this.book.progress - f) < .001) return;
    this.rememberPosition();
    if (this.pdf) {
      this.page = Math.round(f * (this.count - 1));
      await this.renderPDF();
    } else await this.view.goToFraction(f);
  }
  async perform(action: string) {
    switch (action) {
      case "toggle-flow":
        if (this.view?.renderer?.localName !== "foliate-paginator") return;
        this.stopAutoScroll();
        this.settings.flow = this.settings.flow === "scrolled" ? "paginated" : "scrolled";
        this.applySettings();
        await this.persistSettings();
        toast(this.settings.flow === "scrolled" ? "Swipe up or down to scroll." : "Swipe left or right to turn pages.");
        break;
      case "jump-back": {
        const entry = this.navigationHistory.pop();
        if (entry) {
          this.navigatingBack = true;
          try {
            await this.go(entry.location);
            const r = this.view?.renderer, viewport = entry.viewport;
            // A CFI locates text, but aligns its line rather than the exact
            // old viewport. Restore pixels only when that layout is unchanged.
            if (viewport && r?.scrolled && r.getContents()[0]?.index === viewport.section &&
                this.readingLayout() === viewport.layout) {
              const delta = viewport.offset - r.start;
              r.scrollBy(delta, delta);
              r.reportLocation();
            }
          } finally { this.navigatingBack = false; }
        }
        this.root.querySelector<HTMLButtonElement>('[data-action="jump-back"]')!.disabled = !this.navigationHistory.length;
        break;
      }
      case "readwise":
        await exportReadwise(this.book.id);
        break;
      case "exit":
        await this.close();
        break;
      case "previous-chapter":
      case "next-chapter": {
        const delta=action==='next-chapter'?1:-1;
        if(this.pdf){const pages:number[]=[];const visit=(items:any[])=>items.forEach(item=>{const p=Number(item.page??item.uri);if(Number.isFinite(p))pages.push(p);visit(item.subitems??item.down??[]);});visit(this.toc);pages.sort((a,b)=>a-b);const page=delta>0?pages.find(p=>p>this.page):pages.filter(p=>p<this.page).at(-1);if(page!==undefined)await this.go(page);else toast('No more chapters in this direction.');}
        else {const index=this.view.renderer.getContents()[0]?.index??this.currentSection;let next=index+delta;while(next>=0&&next<this.engine.sections.length&&this.engine.sections[next].linear==='no')next+=delta;if(next>=0&&next<this.engine.sections.length)await this.go(next);else toast('No more chapters in this direction.');}
        break;
      }
      case "book-info":
        modal('Book information',`<h3>${E(this.book.title)}</h3><p>${E(this.book.author||'Unknown author')}</p><p>${E(this.book.format.toUpperCase())} · ${Math.round(this.book.blob.size/1024)} KB</p><p>${Math.round(this.book.progress*100)}% read</p><p>${E(this.book.filename)}</p>`);
        break;
      case "brightness": {
        const m=modal('Brightness',range('brightness','Screen brightness',Math.round(this.settings.brightness*100),2,100,1,'%'));this.bindSettings(m);rangeSteppers(m);break;
      }
      case "next":
      case "previous":
        if (this.turning) return;
        this.turning = true;
        try {
          const turn = async () => {
            if (this.pdf) {
              this.page = Math.min(
                this.count - 1,
                Math.max(
                  0,
                  this.page +
                    (action === "next" ? 1 : -1) *
                      (this.settings.columns === 2 && innerWidth > 700 ? 2 : 1),
                ),
              );
              await this.renderPDF();
            } else await this.view[action === "next" ? "next" : "prev"]();
          };
          if (!this.pdf && this.settings.animation === "slide") await turn();
          else
            await turnTransition(
              this.root.querySelector<HTMLElement>("#book-viewport")!,
              this.settings.flow === "scrolled" || this.settings.motion==='reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches
                ? "none"
                : this.settings.animation,
              this.settings.animationSpeed,
              action === "previous",
              turn,
            );
        } finally {
          this.turning = false;
        }
        this.lastInteraction = Date.now();
        break;
      case "toolbar":
        this.toggleControls();
        break;
      case "appearance":
        this.appearance();
        break;
      case "contents":
        this.contents();
        break;
      case "images":
        this.contents("images");
        break;
      case "save-book":
        await saveFile(this.book.filename,this.book.blob);
        break;
      case "notes":
        this.notes();
        break;
      case "search":
        this.search();
        break;
      case "bookmark":
        await this.bookmark();
        break;
      case "speech":
        await this.speech();
        break;
      case "day-night":
        this.settings.theme = ["night", "black", "slate", "amber"].includes(
          this.settings.theme,
        )
          ? "paper"
          : "night";
        this.applySettings();
        await this.persistSettings();
        break;
      case "font-up":
      case "font-down":
        this.settings.fontSize = Math.max(
          10,
          Math.min(
            60,
            this.settings.fontSize + (action === "font-up" ? 1 : -1),
          ),
        );
        this.applySettings();
        await this.persistSettings();
        break;
      case "more":
        this.readerMenu();
        break;
      case "controls":
        this.controls();
        break;
      case "miscellaneous":
        this.more();
        break;
      case "themes":
        this.themeOptions();
        break;
      case "progress":
        this.contents();
        break;
      case "sync":
        await this.flush();
        await sync();
        toast("Reading position synced.");
        break;
      case "speech-stop":
        this.speaking = false;
        this.speechGeneration++;
        clearTimeout(this.sleepTimer);
        if (isNative()) await native("speechControl", { action: "stop" });
        else speechSynthesis.cancel();
        this.clearSpeechPanel();
        break;
      case "speech-next":
      case "speech-previous":
        if (isNative())
          await native("speechControl", {
            action: action === "speech-next" ? "next" : "previous",
          });
        else { this.browserSpeechIndex = Math.max(0, this.browserSpeechIndex + (action === "speech-next" ? 1 : -1)); this.playBrowserSentence(); }
        break;
      case "speech-pause":
        this.paused = !this.paused;
        if (isNative())
          await native("speechControl", {
            action: this.paused ? "pause" : "resume",
          });
        else { this.paused ? speechSynthesis.pause() : speechSynthesis.resume(); const button=this.root.querySelector(".tts-now-playing [data-action=speech-pause]"); if(button)button.innerHTML=icon(this.paused?"play":"pause",17); }
        break;
      case "brightness-up":
      case "brightness-down":
        this.settings.brightness = Math.max(
          0.02,
          Math.min(
            1,
            this.settings.brightness +
              (action === "brightness-up" ? 0.05 : -0.05),
          ),
        );
        this.applySettings();
        await this.persistSettings();
        break;
      case "autoscroll":
        this.autoScroll();
        break;
      case "fullscreen":
        this.settings.fullscreen = !this.settings.fullscreen;
        this.root.classList.toggle("controls-hidden", this.settings.fullscreen);
        this.root.querySelector<HTMLElement>(".reader-mini-status")!.hidden =
          !this.settings.fullscreen || !this.settings.statusBar;
        this.applySettings();
        await this.persistSettings();
        if (isNative())
          await native("immersive", { value: this.settings.fullscreen });
        break;
      case "zoom-in":
      case "zoom-out":
        if (this.pdf) {
          this.zoom = Math.max(
            0.75,
            Math.min(3, this.zoom + (action === "zoom-in" ? 0.25 : -0.25)),
          );
          await this.renderPDF();
        }
        break;
    }
  }
  private imageViewer(src: string) {
    const m = modal(
      "Image",
      `<div class="image-zoom-view"><img src="${E(src)}" alt="Book image"></div>${range("imageZoom", "Zoom", 1, 1, 4, 0.1)}`,
      { wide: true },
    );
    const image = m.querySelector<HTMLImageElement>("img")!;
    m.querySelector<HTMLInputElement>("[data-setting=imageZoom]")!.oninput = (
      e,
    ) => {
      const value = Number((e.target as HTMLInputElement).value);
      image.style.width = value * 100 + "%";
      image.style.maxWidth = "none";
    };
  }
  private updateMiniStatus() {
    const node = this.root.querySelector<HTMLElement>(".status-custom");
    if (!node) return;
    const values: Record<string, string> = {
      clock: this.clockFormat.format(new Date()),
      title: this.book.title,
      percent: Math.round(this.book.progress * 100) + "%",
      chapter: this.root.querySelector("#chapter-name")?.textContent ?? "",
    };
    const text = this.settings.miniStatus.replace(
      /\{(clock|title|percent|chapter)\}/g,
      (_, key) => values[key],
    );
    if (node.textContent !== text) node.textContent = text;
  }
  private async reopenText() {
    if (this.pdf) return;
    this.view?.close();
    this.engine?.destroy?.();
    await this.openReflow();
  }
  private validColor(value: string) {
    return /^#[0-9a-f]{6}$/i.test(value);
  }
  private renderToolbar() {
    const labels: Record<string, string> = {
      appearance: "Style", contents: "Chapters", notes: "Notes", speech: "Listen",
      "day-night": "Night", autoscroll: "Auto-scroll", fullscreen: "Focus",
      search: "Search", sync: "Sync", bookmark: "Bookmark", more: "More",
    };
    // Keep customized toolbars. The former ten-icon default becomes five named actions.
    const legacy = "appearance,day-night,speech,autoscroll,contents,fullscreen,search,sync,bookmark,more";
    const actions = this.settings.toolbar.join(",") === legacy
      ? ["appearance", "contents", "notes", "speech", "more"] : this.settings.toolbar;
    this.root.querySelector(".reader-toolbar")!.innerHTML = actions.map(action =>
      `<button class="reader-tool" data-action="${E(action)}" aria-label="${E(labels[action] ?? actionNames[action] ?? "Reading tool")}">${icon(toolbarIcons[action] ?? "book", 22)}<span>${E(labels[action] ?? actionNames[action] ?? "Tool")}</span></button>`).join("");
  }
  private toggleControls() {
    this.root.classList.toggle("controls-hidden");
    this.root.querySelector<HTMLElement>(".reader-mini-status")!.hidden =
      !this.root.classList.contains("controls-hidden") ||
      !this.settings.statusBar;
    this.applySettings();
  }
  private eventAction(event: string) {
    const action = this.settings.eventActions[event] ?? "none";
    if (action !== "none")
      this.perform(action).catch((e) => toast(e.message, true));
  }
  private readerMenu() {
    const entries: [[string, string], ...[string, string][]] = [
      ["contents", "Chapters"],
      ["day-night", "Day / night"],
      ["fullscreen", "Focus mode"],
      ["sync", "Sync reading position"],
      ["themes", "Themes"],
      ["appearance", "Text & layout"],
      ["controls", "Gestures & buttons"],
      ["miscellaneous", "More settings"],
      ["notes", "Notes & highlights"],
      ["search", "Search"],
      ["speech", "Read aloud"],
      ["autoscroll", "Auto-scroll"],
      ["bookmark", "Add bookmark"],
      ["readwise", "Export highlights to Readwise"],
      ["images", "Book image gallery"],
      ["save-book", "Save book file"],
    ];
    const m = modal(
      "Reader menu",
      `<div class="option-buttons">${entries.map(([action, label]) => `<button class="option-row" data-reader-option="${action}">${icon(toolbarIcons[action] ?? "settings", 22)}<span>${label}</span>${icon("chevron", 17)}</button>`).join("")}</div>`,
    );
    m.classList.add("reader-menu");
    m.querySelectorAll<HTMLElement>("[data-reader-option]").forEach(
      (b) =>
        (b.onclick = () => {
          closeModal();
          this.perform(b.dataset.readerOption!).catch((e) =>
            toast(e.message, true),
          );
        }),
    );
  }
  private controls() {
    const m=controlsSheet(this.settings,()=>{this.applySettings();void this.persistSettings();},a=>this.perform(a));
    this.bindSettings(m);
  }
  private themeOptions() {
    const m = modal(
      "Themes",
      `${themeFilters()}<div class="theme-grid">${Object.entries(themes)
        .map(
          ([id, t]) =>
            `<button data-load-theme="${id}" class="theme-swatch" style="--swatch-bg:${t.bg};--swatch-fg:${t.fg}"><span>Aa</span><small>${E(t.name)}</small></button>`,
        )
        .join(
          "",
        )}</div><div class="native-choice-list">${this.settings.savedThemes.map((t, i) => `<button data-saved-theme="${i}">${E(t.name)}</button>`).join("")}</div><div class="dialog-actions"><button class="secondary" id="theme-save">Save as theme</button><button class="secondary" id="theme-export">Export</button><button class="secondary" id="theme-import">Import</button></div>`,
    );
    bindThemeFilters(m,"[data-load-theme]");
    m.querySelectorAll<HTMLElement>("[data-load-theme]").forEach(
      (b) =>
        (b.onclick = () => {
          this.settings.theme = b.dataset.loadTheme!;
          this.settings.fontColor = "";
          this.settings.backgroundColor = "";this.settings.backgroundPreset='none';this.settings.customBackground='';
          this.applySettings();
          this.persistSettings();
          closeModal();
        }),
    );
    m.querySelectorAll<HTMLElement>("[data-saved-theme]").forEach(
      (b) =>
        (b.onclick = () => {
          const values = this.settings.savedThemes[Number(b.dataset.savedTheme)].values;
          Object.assign(this.settings, values);
          // Themes exported before 1.7 used a single margin for all four sides.
          if (values.margin != null) for (const key of ['marginLeft','marginRight','marginTop','marginBottom'] as const)
            this.settings[key] = values[key] ?? values.margin;
          this.settings.fontScale = values.fontScale ?? 100;
          this.settings.backgroundPreset = values.backgroundPreset ?? 'none';
          this.applySettings();
          this.persistSettings();
          closeModal();
        }),
    );
    m.querySelector("#theme-save")!.addEventListener("click", async () => {
      const name = await inputDialog("Save as theme", "Theme name");
      if (!name) return;
      const keys = [
        "theme",
        "font",
        "fontSize",
        "lineHeight",
        "margin", "marginLeft", "marginRight", "marginTop", "marginBottom", "fontScale", "backgroundPreset", "animation", "animationSpeed", "publisherStyles",
        "paragraphGap",
        "bold",
        "italic",
        "underline",
        "shadow",
        "fontColor",
        "backgroundColor",
        "fontWeight",
        "letterSpacing",
        "wordSpacing",
        "justify",
        "hyphenate",
        "indent",
        "customFont",
        "customBackground",
      ];
      const values: Partial<Settings> = {};
      for (const key of keys)
        (values as any)[key] = (this.settings as any)[key];
      this.settings.savedThemes = this.settings.savedThemes.filter(
        (t) => t.name !== name,
      );
      this.settings.savedThemes.push({ name, values });
      await this.persistSettings();
      toast("Theme saved.");
    });
    m.querySelector("#theme-export")!.addEventListener("click", () =>
      saveFile(
        "Books-themes.json",
        new Blob(
          [JSON.stringify({ version: 1, themes: this.settings.savedThemes })],
          { type: "application/json" },
        ),
      ),
    );
    m.querySelector("#theme-import")!.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async () => {
        try {
          const file = input.files?.[0];
          if (!file || file.size > 20 * 1024 * 1024)
            throw Error("Choose a theme file under 20 MB.");
          const data = JSON.parse(await file.text());
          if (data.version !== 1 || !Array.isArray(data.themes))
            throw Error("Unknown theme format.");
          const allowed = new Set([
            "theme",
            "font",
            "fontSize",
            "lineHeight",
            "margin", "marginLeft", "marginRight", "marginTop", "marginBottom", "fontScale", "backgroundPreset", "animation", "animationSpeed", "publisherStyles",
            "paragraphGap",
            "bold",
            "italic",
            "underline",
            "shadow",
            "fontColor",
            "backgroundColor",
            "fontWeight",
            "letterSpacing",
            "wordSpacing",
            "justify",
            "hyphenate",
            "indent",
            "customFont",
            "customBackground",
          ]);
          for (const t of data.themes) {
            if (
              typeof t.name !== "string" ||
              !t.values ||
              typeof t.values !== "object"
            )
              throw Error("Invalid theme.");
            const values: Partial<Settings> = {};
            for (const [key, value] of Object.entries(t.values))
              if (
                allowed.has(key) &&
                typeof value === typeof (this.settings as any)[key]
              )
                (values as any)[key] = value;
            this.settings.savedThemes.push({ name: t.name, values });
          }
          await this.persistSettings();
          closeModal();
          toast("Themes imported.");
        } catch (e) {
          toast((e as Error).message, true);
        }
      };
      input.click();
    });
  }
  private bindOptionLinks(m: HTMLElement) {
    m.querySelectorAll<HTMLElement>("[data-options-page]").forEach(
      (b) => (b.onclick = () => this.perform(b.dataset.optionsPage!)),
    );
  }
  applySettings() {
    const s = this.settings,
      t = themes[s.theme] ?? themes.paper;
    const bgImage=readerBackground(s);
    const viewport=this.root.querySelector<HTMLElement>('#book-viewport')!;
    viewport.style.backgroundImage=bgImage?`url("${bgImage}")`:'';viewport.style.backgroundSize='cover';
    if(this.view?.renderer){viewport.style.padding=`${s.marginTop}px ${s.marginRight}px ${Math.max(s.marginBottom,this.root.classList.contains('controls-hidden')&&s.statusBar?44:0)}px ${s.marginLeft}px`;viewport.style.boxSizing='border-box';}
    viewport.style.touchAction=s.disableVerticalScroll?'pan-x pinch-zoom':'pan-y';
    const flowButton = this.root.querySelector<HTMLButtonElement>('[data-action="toggle-flow"]');
    if (flowButton) {
      flowButton.hidden = this.view?.renderer?.localName !== "foliate-paginator";
      const scrolled = s.flow === "scrolled";
      flowButton.textContent = scrolled ? "Scroll" : "Pages";
      flowButton.setAttribute("aria-label", scrolled ? "Reading mode: Scroll. Switch to pages" : "Reading mode: Pages. Switch to scrolling");
      flowButton.setAttribute("aria-pressed", String(scrolled));
    }
    const bg = this.validColor(s.backgroundColor) ? s.backgroundColor : t.bg;
    const fg = this.validColor(s.fontColor) ? s.fontColor : t.fg;
    this.root.style.setProperty("--reader-bg", bg);
    this.root.style.setProperty("--reader-fg", fg);
    this.root.style.setProperty("--reader-accent", t.accent);
    const [red, green, blueValue] = this.hexColor(bg);
    const darkPaper = red * .2126 + green * .7152 + blueValue * .0722 < .45;
    this.root.style.setProperty("--books-marker-blend", darkPaper ? "screen" : "multiply");
    this.root.style.setProperty("--books-marker-opacity", darkPaper ? ".26" : ".5");
    this.root.style.setProperty("--selection-surface", darkPaper ? "#23292e" : "#fffefb");
    this.root.style.setProperty("--selection-ink", darkPaper ? "#edf0f2" : "#252a2d");
    this.root.classList.toggle("hide-status", !s.statusBar);
    const blue = this.root.querySelector<HTMLElement>("#blue-light");
    if (blue) blue.style.opacity = String((s.blueLight / 100) * 0.75);
    const ruler = this.root.querySelector<HTMLElement>("#reading-ruler");
    if (ruler) {
      ruler.hidden = s.ruler === "none";
      ruler.dataset.style = s.ruler;
    }
    if (this.view?.renderer) {
      const r = this.view.renderer;
      r.setAttribute("flow", s.flow);
      r.setAttribute("margin", "0px");
      r.setAttribute("gap", "0%");
      r.setAttribute("max-inline-size", innerWidth > 800 ? "680px" : "1000px");
      r.setAttribute("max-column-count", String(s.columns));
      r.toggleAttribute("animated", s.animation === "slide"&&s.motion!=="reduced"&&!matchMedia("(prefers-reduced-motion: reduce)").matches);
      r.toggleAttribute("lock-touch-scroll",s.disableVerticalScroll);
      r.setAttribute("animation-duration", String(s.animationSpeed));
      r.toggleAttribute(
        "manual-touch",
        !s.horizontalFling || s.animation !== "slide" ||
          s.eventActions.swipeLeft !== "next" ||
          s.eventActions.swipeRight !== "previous",
      );
      const important = s.publisherStyles ? "" : "!important";
      const family = s.customFont ? "BooksCustom" : (readerFonts[s.font]?.family ?? readerFonts.Literata.family);
      const fontDeclaration = s.font === "Publisher" && !s.customFont ? "" : `font-family:${family}${important};`;
      const css = `${fontFaceCSS()} ${s.customFont ? `@font-face{font-family:BooksCustom;src:url('${s.customFont}')}` : ""} html,body{background:${bgImage?"transparent":bg}!important;color:${fg}!important;}body{${fontDeclaration}font-size:${s.fontSize*s.fontScale/100}px${important};line-height:${s.lineHeight}${important};}p,li,blockquote{font-size:inherit${important};line-height:inherit${important};${s.font === "Publisher" && !s.customFont ? "" : `font-family:inherit${important};`}font-weight:${s.bold ? "bold" : s.fontWeight}${important};font-style:${s.italic ? "italic" : "normal"}${important};text-shadow:${s.shadow ? "1px 1px 1px #0003" : "none"}${important};text-align:${s.justify ? "justify" : "start"}${important};hyphens:${s.hyphenate ? "auto" : "manual"}${important};}body{user-select:${s.eventActions.longPress==="select-text"?"text":"none"};-webkit-user-select:${s.eventActions.longPress==="select-text"?"text":"none"};letter-spacing:${s.letterSpacing}px${important};word-spacing:${s.wordSpacing}px${important};writing-mode:${s.verticalText ? "vertical-rl" : "horizontal-tb"}${important};}p{text-decoration:${s.underline ? "underline" : "none"}${important};margin-block:${s.paragraphGap}em${important};text-indent:${s.indent ? "1.4em" : "0"}${important};}a{color:${t.accent}!important;}img,video{max-width:100%;}::selection{background:#d9c59266;color:inherit}`;
      if (r !== this.styledRenderer || css !== this.reflowStyle) {
        r.setStyles?.(css);
        this.styledRenderer = r;
        this.reflowStyle = css;
      }
    }
    this.applyPDFFilter();
    this.updateMiniStatus();
    this.root.querySelector<HTMLElement>('.reader-mini-status')!.hidden=!s.statusBar||!this.root.classList.contains('controls-hidden');
    this.root.querySelector<HTMLElement>("#book-viewport")!.style.overflowX =
      s.scrollLock ? "hidden" : "auto";
    if (isNative()) {
      this.applyNativeSetting("brightness", { value: s.brightness });
      this.applyNativeSetting("immersive", { value: s.fullscreen });
      this.applyNativeSetting("readerOptions", {
        awake: s.keepAwake,
        shake: s.shakeAction!=="none",
        shakeThreshold:s.shakeThreshold,
        hardwareKeys:s.hardwareKeys,
        tilt: s.tiltPages,
        orientation: s.orientation,
        reading: true,
        volumeKeys: s.volumeKeys,
        mappedKeys: true,
      });
    }
  }
  private applyNativeSetting(action: string, values: Record<string, unknown>) {
    const serialized = JSON.stringify(values);
    if (this.nativeSettings.get(action) === serialized) return;
    this.nativeSettings.set(action, serialized);
    native(action, values).catch(() => {
      if (this.nativeSettings.get(action) === serialized)
        this.nativeSettings.delete(action);
    });
  }
  private applyPDFFilter() {
    for (const img of this.root.querySelectorAll<HTMLElement>(".pdf-page>img"))
      img.style.filter = ["night", "black", "slate", "amber"].includes(
        this.settings.theme,
      )
        ? "invert(.88) hue-rotate(180deg)"
        : this.settings.theme === "sepia"
          ? "sepia(.65)"
          : this.settings.theme === "forest"
            ? "sepia(.4) hue-rotate(40deg)"
            : "none";
  }
  async persistSettings() {
    await db.saveSettings(this.settings);
  }
  appearance() {
    const s = this.settings;
    const m = modal(
      "Text & layout",
      `<div class="appearance-preview" style="background:${themes[s.theme]?.bg};color:${themes[s.theme]?.fg}"><span>Your reading page</span><p>Aa Bb Cc · The quick brown fox jumps over the lazy dog.</p></div><h3 class="setting-heading">Page theme</h3><div class="theme-grid">${Object.entries(
        themes,
      )
        .map(
          ([id, t]) =>
            `<button aria-label="${t.name} theme" class="theme-swatch ${id === s.theme ? "selected" : ""}" data-theme="${id}" style="--swatch-bg:${t.bg};--swatch-fg:${t.fg}"><span>Aa</span><small>${t.name}</small></button>`,
        )
        .join(
          "",
        )}</div>${select("font", "Typeface", s.font, fontOptions)}${range("fontSize", "Text size", s.fontSize, 10, 60, 1, " px")}${range("lineHeight", "Line spacing", s.lineHeight, 1, 2.6, 0.1)}${range("margin", "Page margins", s.margin, 8, 80, 1, " px")}${range("paragraphGap", "Paragraph spacing", s.paragraphGap, 0, 2, 0.05)}<div class="settings-pair">${toggle("bold", "Bold", s.bold)}${toggle("italic", "Italic", s.italic)}</div>${toggle("shadow", "Text shadow", s.shadow)}${toggle("justify", "Justify text", s.justify)}${toggle("hyphenate", "Hyphenation", s.hyphenate)}${toggle("indent", "Indent paragraphs", s.indent)}${toggle("publisherStyles", "Prefer publisher typography", s.publisherStyles)}${select("flow", "Reading mode", s.flow, { paginated: "Turn pages", scrolled: "Scroll vertically" })}${select("columns", "Landscape columns", s.columns, { "1": "One page", "2": "Two pages" })}${select("animation", "Page animation", s.animation, animationNames)}${range("animationSpeed", "Animation duration", s.animationSpeed, 100, 1200, 50, " ms")}${range("brightness", "Screen brightness", Math.round(s.brightness * 100), 2, 100, 1, "%")}${range("blueLight", "Warm light filter", s.blueLight, 0, 95, 1, "%")}${select("ruler", "Reading ruler", s.ruler, { none: "Off", underline: "Underline", line: "Reading line", band: "Focus band", window: "Focus window", dashed: "Dashed line", soft: "Soft focus" })}<div class="dialog-actions"><button class="secondary" id="custom-font">${icon("type", 16)} Import font</button><button class="secondary" id="custom-background">${icon("palette", 16)} Background</button><button class="secondary" id="reset-custom">Reset custom</button></div>`,
      { subtitle: "Your settings are saved automatically." },
    );
    m.classList.add("reader-options");
    const preview = m.querySelector<HTMLElement>(".appearance-preview")!;
    const colors = document.createElement("details");
    colors.className = "page-colors advanced-settings";
    colors.innerHTML = `<summary>Page colors ${icon("down", 18)}</summary>`;
    colors.insertAdjacentHTML("beforeend",themeFilters());
    colors.append(m.querySelector(".theme-grid")!);
    bindThemeFilters(colors,"[data-theme]");
    m.querySelector(".setting-heading")?.remove();
    const basics = ["fontSize", "font", "lineHeight", "margin", "flow"].map(key => m.querySelector(`[data-setting="${key}"]`)!.closest("label")!);
    preview.after(...basics, colors);
    const fontBrowser=document.createElement("button");fontBrowser.className="secondary font-browser-button";fontBrowser.id="browse-fonts";fontBrowser.innerHTML=`${icon("type",18)} Explore ${Object.keys(readerFonts).length} typefaces`;basics[1].after(fontBrowser);fontBrowser.onclick=()=>this.fontLibrary();
    preview.style.fontFamily=readerFonts[s.font]?.family??"serif";
    const extra = document.createElement("div");
    extra.innerHTML = `<label class="select-field"><span>Font Color</span><input type="color" id="font-color" value="${this.validColor(s.fontColor) ? s.fontColor : themes[s.theme].fg}"></label><label class="select-field"><span>Background Color</span><input type="color" id="background-color" value="${this.validColor(s.backgroundColor) ? s.backgroundColor : themes[s.theme].bg}"></label>${toggle("underline", "Underline", s.underline)}${range("fontWeight", "Font-Weight", s.fontWeight, 100, 900, 100)}${range("letterSpacing", "Letter spacing", s.letterSpacing, -2, 8, 0.2)}${range("wordSpacing", "Word spacing", s.wordSpacing, -2, 12, 0.5)}${toggle("verticalText", "Vertical Alignment", s.verticalText)}${toggle("trimSpaces", "Trim blank spaces and empty paragraphs", s.trimSpaces)}${select("bionic", "Bionic reading", s.bionic, { none: "Off", half: "Bold half of each word", third: "Bold first third" })}<button class="secondary" id="apply-processing">Apply text processing</button><div class="dialog-actions"><button class="secondary" data-options-page="controls">Control Options</button><button class="secondary" data-options-page="miscellaneous">Miscellaneous</button><button class="secondary" data-options-page="themes">Save / Load theme</button></div>`;
    const advanced = document.createElement("details");
    advanced.className = "advanced-settings";
    advanced.innerHTML = `<summary>Advanced typography ${icon("down", 18)}</summary>`;
    const folded = ["paragraphGap", "bold", "shadow", "justify", "hyphenate", "indent", "publisherStyles"];
    for (const key of folded) {
      const control = m.querySelector(`[data-setting="${key}"]`);
      const row = control?.closest(".settings-pair") ?? control?.closest("label");
      if (row) extra.prepend(row);
    }
    advanced.append(extra);
    m.querySelector(".modal-body")!.append(advanced);
    const fine=document.createElement('details');fine.className='advanced-settings independent-margins';fine.innerHTML=`<summary>Individual page margins ${icon('down',18)}</summary>${range('marginLeft','Left margin',s.marginLeft,0,80,1,' px')}${range('marginRight','Right margin',s.marginRight,0,80,1,' px')}${range('marginTop','Top margin',s.marginTop,0,100,1,' px')}${range('marginBottom','Bottom margin',s.marginBottom,0,100,1,' px')}<button class="subtle" data-reset-group="margins">Reset margins</button>`;basics[3].after(fine);
    extra.insertAdjacentHTML('afterbegin',`${range('fontScale','Font scale',s.fontScale,50,150,1,'%')}<p class="small" data-option-search="smooth">Smooth text / anti-aliasing is managed automatically by Android. Books uses the system text renderer.</p><div class="dialog-actions"><button class="subtle" data-reset-group="font">Reset font style</button><button class="subtle" data-reset-group="alignment">Reset alignment</button><button class="subtle" data-reset-group="spacing">Reset spacing</button></div>`);
    const animations=document.createElement('div');animations.className='animation-gallery';animations.setAttribute('role','group');animations.setAttribute('aria-label','Page animation previews');animations.innerHTML=Object.entries(animationNames).map(([id,name])=>`<button data-animation="${id}" aria-pressed="${id===s.animation}"><span class="animation-paper"><i></i><i></i><i></i></span><small>${name}</small></button>`).join('');m.querySelector('[data-setting=animation]')!.closest('label')!.after(animations);
    animations.querySelectorAll<HTMLElement>('[data-animation]').forEach(b=>b.onclick=()=>{const choice=m.querySelector<HTMLSelectElement>('[data-setting=animation]')!;choice.value=b.dataset.animation!;choice.dispatchEvent(new Event('input',{bubbles:true}));animations.querySelectorAll('[data-animation]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(s.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const transforms:Record<string,string>={slide:'translateX(16px)',vertical:'translateY(-16px)',fade:'scale(1)',flip:'rotateY(70deg)',curl:'skewY(-12deg)',zoom:'scale(.72)',none:'none',eink:'none'};if(!['none','eink'].includes(s.animation))b.querySelector('.animation-paper')!.animate([{opacity:.4,transform:transforms[s.animation]},{opacity:1,transform:'none'}],{duration:s.animationSpeed});});
    m.querySelectorAll<HTMLElement>('[data-reset-group]').forEach(b=>b.onclick=()=>{const groups:Record<string,(keyof Settings)[]>={font:['font','customFont','fontWeight','bold','italic','underline','shadow'],alignment:['justify','hyphenate'],spacing:['paragraphGap','lineHeight','letterSpacing','wordSpacing','fontScale'],margins:['margin','marginLeft','marginRight','marginTop','marginBottom']};for(const key of groups[b.dataset.resetGroup!])(s as any)[key]=defaults[key];this.applySettings();void this.persistSettings();this.appearance();});
    searchableOptions(m);rangeSteppers(m);
    this.bindOptionLinks(m);
    m.querySelector("#apply-processing")!.addEventListener(
      "click",
      async () => {
        closeModal();
        await this.reopenText();
      },
    );
    for (const [id, key] of [
      ["font-color", "fontColor"],
      ["background-color", "backgroundColor"],
    ])
      m.querySelector<HTMLInputElement>("#" + id)!.oninput = (e) => {
        (s as any)[key] = (e.target as HTMLInputElement).value;
        this.applySettings();
        this.persistSettings();
      };
    m.querySelectorAll<HTMLElement>("[data-theme]").forEach((b) =>
      b.addEventListener("click", () => {
        s.theme = b.dataset.theme!;
        s.fontColor = "";
        s.backgroundColor = "";s.backgroundPreset='none';s.customBackground='';
        this.applySettings();
        this.persistSettings();
        m.querySelectorAll("[data-theme]").forEach((x) =>
          x.classList.toggle("selected", x === b),
        );
        const p = m.querySelector<HTMLElement>(".appearance-preview")!;
        p.style.background = themes[s.theme].bg;
        p.style.color = themes[s.theme].fg;
      }),
    );
    this.bindSettings(m);
    for (const [id, accept, key] of [
      ["custom-font", ".ttf,.otf", "customFont"],

    ])
      m.querySelector("#" + id)!.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.onchange = () => {
          const f = input.files?.[0];
          if (!f) return;
          if (f.size > 8 * 1024 * 1024) {
            toast("Choose a file under 8 MB.", true);
            return;
          }
          const fr = new FileReader();
          fr.onload = () => {
            (s as any)[key] = fr.result;
            this.applySettings();
            this.persistSettings();
            toast(
              "Custom " +
                (key === "customFont" ? "font" : "background") +
                " applied.",
            );
          };
          fr.readAsDataURL(f);
        };
        input.click();
      });
    m.querySelector('#custom-background')!.addEventListener('click',()=>backgroundPicker(s,()=>{this.applySettings();void this.persistSettings();}));
    m.querySelector("#reset-custom")!.addEventListener("click", () => {
      s.customFont = "";
      s.customBackground = "";s.backgroundPreset='none';
      this.applySettings();
      this.persistSettings();
      toast("Custom font and background reset.");
    });
  }
  private bindSettings(m: HTMLElement) {
    m.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "[data-setting]",
    ).forEach((input) =>
      input.addEventListener("input", () => {
        const key = input.dataset.setting!;
        let value: any =
          input instanceof HTMLInputElement && input.type === "checkbox"
            ? input.checked
            : input.value;
        if (typeof (this.settings as any)[key] === "number")
          value = Number(value);
        if (key === "brightness") value /= 100;
        (this.settings as any)[key] = value;
        if(key==='margin'){this.settings.marginLeft=value;this.settings.marginRight=value;this.settings.marginTop=value;this.settings.marginBottom=value;}
        if(key==='shakeTTS')this.settings.shakeAction=value?'speech':'none';
        if(key === "font"){this.settings.customFont="";this.settings.publisherStyles=value==="Publisher";const preview=m.querySelector<HTMLElement>(".appearance-preview");if(preview)preview.style.fontFamily=readerFonts[value]?.family??"serif";}
        const legacyEvents: Record<string, string> = {
          tapLeft: "tapLeft",
          tapCenter: "tapCenter",
          tapRight: "tapRight",
          swipeUp: "swipeUp",
          swipeDown: "swipeDown",
          doubleTap: "doubleTap",
        };
        if (legacyEvents[key])
          this.settings.eventActions[legacyEvents[key]] = value;
        const output = input.closest("label")?.querySelector("output");
        if (output)
          output.textContent =
            String(input.value)+(input.dataset.suffix??'');
        this.applySettings();
        this.persistSettings();
        if (this.pdf && key === "columns") this.renderPDF();
      }),
    );
  }
  contents(tab = "chapters") {
    readerSidebar({book:this.book,toc:this.toc,marks:()=>this.marks,engine:this.engine,pdf:!!this.pdf,pageCount:this.count,section:this.currentSection,
      go:location=>this.go(location),fraction:value=>this.goFraction(value),bookmark:()=>this.bookmark(),
      remove:async id=>{const mark=this.marks.find(m=>m.id===id);if(mark){await this.removeMark(mark);this.clearSelection();}},
      renderPage:async page=>{const result=await this.rpc("render",{page,width:700});return new Blob([result.png],{type:"image/png"});}
    },tab);
  }
  private fontLibrary() {
    const m=modal("Reading fonts",`<p class="small">All bundled fonts work offline. Publisher original keeps the book's embedded typeface; Manrope matches the Books interface.</p><label class="navigator-search">${icon("search",18)}<input type="search" aria-label="Find a font" placeholder="Find a font"></label><div class="font-library">${Object.entries(readerFonts).map(([id,font])=>`<button data-reader-font="${id}" aria-pressed="${id===this.settings.font}" style="font-family:${E(font.family)}"><span>${E(font.label)}<small>${font.category}</small></span><p>${font.category==="Hindi"?"किताबों में एक नई दुनिया है।":"The world is made of stories."}</p>${icon("check",18)}</button>`).join("")}</div>`);
    m.classList.add("font-library-dialog");m.querySelector<HTMLInputElement>('input')!.oninput=e=>{const q=(e.target as HTMLInputElement).value.toLowerCase();m.querySelectorAll<HTMLElement>('[data-reader-font]').forEach(el=>el.hidden=!el.textContent?.toLowerCase().includes(q))};
    m.querySelectorAll<HTMLElement>('[data-reader-font]').forEach(button=>button.onclick=()=>{this.settings.font=button.dataset.readerFont!;this.settings.customFont="";this.settings.publisherStyles=this.settings.font==="Publisher";this.applySettings();void this.persistSettings();m.querySelectorAll('[data-reader-font]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));});
  }
  private async bookmark() {
    const existing = this.marks.find(
      (m) => m.type === "bookmark" && m.location === this.book.location,
    );
    if (existing) {
      await db.deleteMark(existing.id);
      this.marks = this.marks.filter((m) => m.id !== existing.id);
      toast("Bookmark removed.");
      return;
    }
    const now = Date.now();
    const m: Mark = {
      id: uid(),
      bookId: this.book.id,
      type: "bookmark",
      location: this.book.location,
      quote: this.currentText.slice(0, 180),
      note: "",
      color: "#e7cf75",
      created: now,
      updated: now,
    };
    await db.putMark(m);
    this.marks.push(m);
    toast("Page bookmarked.");
  }
  private showSelection() {
    const el = this.root.querySelector<HTMLElement>("#selection-tools")!;
    const wasHidden = el.hidden;
    el.hidden = false;
    if (el.childElementCount) {
      if (wasHidden) {
        el.querySelector<HTMLElement>(".selection-palette")!.hidden = true;
        el.querySelector('[data-selection="palette"]')!.setAttribute("aria-expanded", "false");
      }
      this.refreshSelectionTools();
      return;
    }
    el.innerHTML = `<div class="selection-palette" hidden>
      <div class="selection-heading"><span class="selection-title">Mark this passage</span><label class="custom-highlight" title="Custom color">${icon("palette", 18)}<input type="color" id="highlight-custom-color" value="${E(this.settings.highlightColor)}" aria-label="Custom highlight color"></label><button data-selection="close" aria-label="Close selection">${icon("close", 18)}</button></div>
      <blockquote class="selection-preview"><span></span></blockquote>
      <div class="selection-styles" role="group" aria-label="Highlight style">${[["Highlight", "Marker"], ["Underline", "Underline"], ["StrikeOut", "Strike"], ["Squiggly", "Wavy"]].map(([style, label]) => `<button data-selection-style="${style}" aria-label="${style}"><span>${label}</span></button>`).join("")}</div>
      <div class="selection-colors" role="group" aria-label="Highlight color">${highlightColors.map(({color, name}) => `<button class="highlight-color" data-color="${color}" style="--highlight-color:${color}" aria-label="${name} highlight"><span class="highlight-swatch">${icon("check", 14)}</span><span>${name}</span></button>`).join("")}</div>
    </div><div class="selection-actions"><button data-selection="palette" aria-label="Highlight style and color" aria-expanded="false">${icon("highlight", 19)}<span class="selection-current-color"></span></button><button data-selection="copy">Copy</button><button data-selection="highlight">Highlight</button><button data-selection="note">Note</button><button data-selection="more" aria-label="More text actions">${icon("more", 18)}</button><button data-selection="delete" aria-label="Delete highlight" hidden>${icon("trash", 17)}</button></div>`;
    el.querySelectorAll<HTMLElement>("[data-selection-style]").forEach(button => button.onclick = () => {
      this.selectionStyle = button.dataset.selectionStyle!;
      this.settings.highlightStyle = this.selectionStyle;
      this.persistSettings().catch(console.error);
      this.refreshSelectionTools();
    });
    el.querySelectorAll<HTMLElement>("[data-color]").forEach(button => button.onclick = () => {
      this.addHighlight(button.dataset.color!).catch(error => toast(error.message, true));
    });
    el.querySelector<HTMLInputElement>("#highlight-custom-color")!.onchange = event => {
      this.addHighlight((event.target as HTMLInputElement).value).catch(error => toast(error.message, true));
    };
    el.querySelectorAll<HTMLElement>("[data-selection]").forEach(button => button.onclick = async () => {
      try {
        switch (button.dataset.selection) {
          case "palette": {
            const palette = el.querySelector<HTMLElement>(".selection-palette")!;
            palette.hidden = !palette.hidden;
            button.setAttribute("aria-expanded", String(!palette.hidden));
            this.refreshSelectionTools();
            return;
          }
          case "close":
            this.clearSelection();
            return;
          case "copy":
            if (isNative()) await native("copy", { text: this.selected?.quote ?? "" });
            else await navigator.clipboard.writeText(this.selected?.quote ?? "");
            toast("Text copied.");
            this.clearSelection();
            return;
          case "highlight":
            await this.addHighlight(this.selectedMark()?.color ?? this.settings.highlightColor);
            return;
          case "note":
            this.editSelectionNote();
            return;
          case "dictionary":
            await this.dictionary(this.selected?.quote ?? "");
            return;
          case "more":
            this.selectionMenu();
            return;
          case "delete": {
            const existing = this.selectedMark();
            if (existing) await this.removeMark(existing);
            this.clearSelection();
            toast("Highlight removed.");
          }
        }
      } catch (error) { toast((error as Error).message, true); }
    });
    this.refreshSelectionTools();
  }
  private clearSelection() {
    this.selected?.range?.startContainer.ownerDocument?.getSelection()?.removeAllRanges();
    this.selected = null;
    this.view?.deselect();
    window.getSelection()?.removeAllRanges();
    this.root.querySelector<HTMLElement>("#selection-tools")!.hidden = true;
  }
  private selectionMenu() {
    const quote = this.selected?.quote ?? "";
    const m = modal("Selected text", `<div class="option-buttons">${[["dictionary", "Dictionary"], ["share", "Share"], ["translate", "Translate"], ["speak", "Read selected text"], ["search", "Search the web"], ["close", "Close selection"]].map(([action, label]) => `<button class="option-row" data-selection-extra="${action}"><span>${label}</span></button>`).join("")}</div>`);
    m.classList.add("overflow-menu", "selection-more-menu");
    m.querySelectorAll<HTMLElement>("[data-selection-extra]").forEach(button => button.onclick = async () => {
      closeModal();
      try {
        switch (button.dataset.selectionExtra) {
          case "dictionary": await this.dictionary(quote); return;
          case "share": await share(quote + "\n— " + this.book.title); break;
          case "translate": window.open("https://translate.google.com/?sl=auto&tl=en&text=" + encodeURIComponent(quote) + "&op=translate", "_blank", "noopener"); break;
          case "search": window.open("https://www.google.com/search?q=" + encodeURIComponent(quote), "_blank", "noopener"); break;
          case "speak": await this.speakSelection(quote); break;
        }
        this.clearSelection();
      } catch (error) { toast((error as Error).message, true); }
    });
  }
  private async speakSelection(text: string) {
    if (!text.trim()) return;
    this.speaking = true;
    this.paused = false;
    this.nativeSpeechQueue = true;
    this.showSpeechPanel(text);
    try {
      if (isNative()) await native("speak", { sections: [{ text, location: this.pdf ? this.page : this.currentSection }], bookId: this.book.id, title: this.book.title, rate: this.settings.ttsRate, pitch: this.settings.ttsPitch, engine: this.settings.ttsEngine, voice: this.settings.ttsVoice });
      else {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.settings.ttsRate;
        utterance.pitch = this.settings.ttsPitch;
        utterance.voice = speechSynthesis.getVoices().find(voice => voice.name === this.settings.ttsVoice) ?? null;
        utterance.onend = utterance.onerror = () => { this.speaking = false; this.clearSpeechPanel(); };
        speechSynthesis.speak(utterance);
      }
    } catch (error) { this.speaking = false; this.clearSpeechPanel(); throw error; }
  }
  private editSelectionNote() {
    if (!this.selected) return;
    const selected = { ...this.selected };
    const existing = this.selectedMark();
    const m = modal(existing?.note ? "Edit annotation" : "Annotation", `<form id="input-dialog" class="annotation-editor"><blockquote>${E(selected.quote.slice(0, 1500))}</blockquote><label class="field">Note<textarea name="value" rows="5" placeholder="Write a note…">${E(existing?.note ?? "")}</textarea></label><div class="annotation-appearance"><label>Style<select name="style">${["Highlight", "Underline", "StrikeOut", "Squiggly"].map(style => `<option ${style === this.selectionStyle ? "selected" : ""}>${style}</option>`).join("")}</select></label><label>Color<input type="color" name="color" value="${E(existing?.color ?? this.settings.highlightColor)}"></label></div><div class="dialog-actions"><button type="button" class="secondary" id="annotation-cancel">Cancel</button><button type="submit" class="primary">Save</button></div></form>`);
    m.classList.add("reader-options", "annotation-dialog");
    m.querySelector("#annotation-cancel")!.addEventListener("click", closeModal);
    m.addEventListener("modalclose", () => setTimeout(() => {
      if (!this.closing && this.selected && !document.querySelector(".modal")) this.showSelection();
    }, 0), { once: true });
    m.querySelector("form")!.addEventListener("submit", async event => {
      event.preventDefault();
      const note = m.querySelector<HTMLTextAreaElement>("textarea")!.value;
      const color = m.querySelector<HTMLInputElement>('[name="color"]')!.value;
      this.selectionStyle = m.querySelector<HTMLSelectElement>('[name="style"]')!.value;
      this.selected = selected;
      closeModal();
      try { await this.addHighlight(color, note); } catch (error) { toast((error as Error).message, true); }
    });
    m.querySelector<HTMLTextAreaElement>("textarea")!.focus();
  }
  private selectedMark() {
    return this.marks.find(
      (mark) =>
        mark.type !== "bookmark" &&
        (mark.id === this.selected?.markId ||
          (!this.pdf && mark.location === this.selected?.location)),
    );
  }
  private refreshSelectionTools() {
    const el = this.root.querySelector<HTMLElement>("#selection-tools")!;
    const mark = this.selectedMark();
    const color = mark?.color ?? this.settings.highlightColor;
    el.style.setProperty("--selection-color", color);
    el.dataset.markStyle = this.selectionStyle;
    el.querySelector('[data-selection="highlight"]')!.textContent = mark ? "Save" : "Highlight";
    el.querySelector(".selection-title")!.textContent = mark ? "Your highlight" : "Mark this passage";
    el.querySelector(".selection-preview span")!.textContent = this.selected?.quote.slice(0, 180) ?? "";
    el.querySelector<HTMLInputElement>("#highlight-custom-color")!.value = color;
    el.querySelector<HTMLElement>('[data-selection="delete"]')!.hidden = !mark;
    for (const button of el.querySelectorAll<HTMLElement>(
      "[data-selection-style]",
    ))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.selectionStyle === this.selectionStyle),
      );
    for (const button of el.querySelectorAll<HTMLElement>("[data-color]"))
      button.setAttribute(
        "aria-pressed",
        String(
          button.dataset.color ===
            (mark?.color ?? this.settings.highlightColor),
        ),
      );
    const range = this.selected?.range;
    if (!range) return;
    const doc = range.startContainer.ownerDocument;
    const frame = doc?.defaultView?.frameElement?.getBoundingClientRect();
    const left = frame?.left ?? 0,
      top = frame?.top ?? 0;
    const viewport = this.root
      .querySelector("#book-viewport")!
      .getBoundingClientRect();
    const visible = Array.from(range.getClientRects())
      .map((rect) => ({
        left: rect.left + left,
        right: rect.right + left,
        top: rect.top + top,
        bottom: rect.bottom + top,
      }))
      .filter(
        (rect) =>
          rect.bottom > viewport.top &&
          rect.top < viewport.bottom &&
          rect.right > 0 &&
          rect.left < innerWidth,
      );
    if (!visible.length) return;
    const first = visible[0],
      last = visible[visible.length - 1];
    const height = el.offsetHeight,
      width = el.offsetWidth;
    const above = first.top - height - 18;
    const below = last.bottom + 22;
    const position = above >= viewport.top + 8 ? above : below;
    el.style.top =
      Math.max(8, Math.min(innerHeight - height - 8, position)) + "px";
    el.style.left =
      Math.max(
        width / 2 + 8,
        Math.min(innerWidth - width / 2 - 8, (first.left + first.right) / 2),
      ) + "px";
  }
  private async removeMark(mark: Mark) {
    if (this.pdf && this.book.format === "pdf" && mark.type !== "bookmark") {
      await this.rpc("deleteAnnotation", { page: mark.location, id: mark.id });
      await this.savePDF();
      await this.renderPDF();
    }
    await db.deleteMark(mark.id);
    if (!this.pdf && mark.type !== "bookmark")
      await this.view.deleteAnnotation({ value: mark.location });
    this.marks = this.marks.filter((item) => item.id !== mark.id);
    if (this.pdf && this.book.format !== "pdf") await this.renderPDF();
  }
  private async addHighlight(color: string, note?: string) {
    if (!this.selected || this.savingHighlight) return;
    this.savingHighlight = true;
    try {
      const selected = { ...this.selected };
      const existing = this.selectedMark();
      note ??= existing?.note ?? "";
      const now = Date.now();
      const m: Mark = {
        id: existing?.id ?? uid(),
        bookId: this.book.id,
        type: note ? "note" : "highlight",
        location: selected.location,
        quote: selected.quote,
        note,
        color,
        style: this.selectionStyle,
        quads: selected.quads ?? existing?.quads,
        created: existing?.created ?? now,
        updated: now,
      };
      if (this.pdf && this.book.format === "pdf") {
        if (existing) await this.rpc("editAnnotation", { page: m.location, id: m.id, type: m.style, text: note, color: this.hexColor(color) });
        else await this.rpc("annotate", { page: m.location, id: m.id, type: m.style, quads: m.quads, text: note, color: this.hexColor(color) });
        await this.savePDF();
        await this.renderPDF();
      } else if (this.pdf) {
        m.quads = selected.quads?.map((q) =>
          q.map((v, i) => v / (i % 2 ? this.pdfBounds[3] : this.pdfBounds[2])),
        );
      } else
        await this.view.addAnnotation({
          value: m.location,
          color,
          style: m.style,
        });
      await db.putMark(m);
      this.settings.highlightColor = color;
      this.settings.highlightStyle = this.selectionStyle;
      await this.persistSettings();
      if (existing)
        this.marks = this.marks.map((mark) => (mark.id === m.id ? m : mark));
      else this.marks.push(m);
      if (this.pdf && this.book.format !== "pdf") await this.renderPDF();
      this.root.querySelector<HTMLElement>("#selection-tools")!.hidden = true;
      this.selected = null;
      this.view?.deselect();
      window.getSelection()?.removeAllRanges();
      toast(note ? "Note saved." : "Passage highlighted.");
    } finally {
      this.savingHighlight = false;
    }
  }
  private hexColor(color: string) {
    return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  }
  private async dictionary(word: string) {
    if (isNative()) {
      try {
        await native("dictionary", { word });
        return;
      } catch {}
    }
    const m = modal(
      "Dictionary",
      `<div class="loading-inline">${icon("book")} Looking up “${E(word.slice(0, 60))}”…</div>`,
      { subtitle: "Online definitions from Free Dictionary API" },
    );
    try {
      const response = await network(
        "https://api.dictionaryapi.dev/api/v2/entries/en/" +
          encodeURIComponent(word.trim().split(/\s/)[0]),
      );
      if (!response.ok)
        throw Error(
          "No definition found. Try a single English word, or install a compatible offline dictionary on Android.",
        );
      const result = await response.json(),
        entry = result[0];
      m.querySelector(".modal-body")!.innerHTML =
        `<h3 class="dictionary-word">${E(entry.word)}</h3><p class="muted">${E(entry.phonetic ?? "")}</p>${entry.meanings
          .map(
            (meaning: any) =>
              `<p class="eyebrow">${E(meaning.partOfSpeech)}</p><ol>${meaning.definitions
                .slice(0, 4)
                .map(
                  (d: any) =>
                    `<li>${E(d.definition)}${d.example ? `<p class="muted">${E(d.example)}</p>` : ""}</li>`,
                )
                .join("")}</ol>`,
          )
          .join(
            "",
          )}<small>Definitions: ${E(entry.sourceUrls?.join(", ") ?? "Wiktionary")}</small>`;
    } catch (e) {
      m.querySelector(".modal-body")!.textContent = (e as Error).message;
    }
  }
  notes() {
    const m = modal("Bookmarks / Highlights", `<div class="marks-toolbar"><input id="marks-search" type="search" placeholder="Search highlights and notes" aria-label="Search highlights and notes"><select id="marks-sort" aria-label="Sort annotations"><option value="position">By position</option><option value="date">Newest first</option></select></div><div class="marks-tabs" role="tablist">${[["all", "All"], ["bookmark", "Bookmarks"], ["highlight", "Highlights"], ["note", "Notes"]].map(([id, label]) => `<button role="tab" data-mark-filter="${id}" aria-selected="${id === "all"}">${label}</button>`).join("")}</div><div class="marks-list"></div><div class="dialog-actions"><button class="secondary" id="export-marks">${icon("download", 16)} Export</button><button class="secondary" id="readwise-marks">Readwise</button></div>`);
    m.classList.add("marks-dialog");
    let filter = "all";
    const renderMarks = () => {
      const query = m.querySelector<HTMLInputElement>("#marks-search")!.value.trim().toLocaleLowerCase();
      const newest = m.querySelector<HTMLSelectElement>("#marks-sort")!.value === "date";
      const rows = this.marks.filter(mark => (filter === "all" || mark.type === filter) && (!query || `${mark.quote} ${mark.note}`.toLocaleLowerCase().includes(query))).slice().sort((a, b) => newest ? b.created - a.created : String(a.location).localeCompare(String(b.location), undefined, { numeric: true }));
      m.querySelector(".marks-list")!.innerHTML = rows.map(mark => `<article class="mark-card" style="--mark-color:${E(mark.color)}"><div class="mark-meta">${icon(mark.type === "bookmark" ? "bookmark" : "highlight", 15)} ${mark.type === "bookmark" ? "Bookmark" : mark.style ?? "Highlight"} · ${new Date(mark.created).toLocaleDateString()}${typeof mark.location === "number" ? ` · Page ${mark.location + 1}` : ""}</div><button class="mark-quote" data-mark-go="${mark.id}">${E(mark.quote || "Saved page")}</button>${mark.note ? `<p>${E(mark.note)}</p>` : ""}<div class="mark-actions"><button class="subtle" data-mark-edit="${mark.id}">${mark.type === "bookmark" ? "Edit note" : "Edit annotation"}</button><button class="subtle" data-mark-delete="${mark.id}">Remove</button></div></article>`).join("") || `<p class="empty-small">${query ? "No matching annotations." : "No annotations in this tab. Select text to highlight it, or bookmark a page."}</p>`;
    };
    m.querySelector<HTMLInputElement>("#marks-search")!.oninput = renderMarks;
    m.querySelector<HTMLSelectElement>("#marks-sort")!.onchange = renderMarks;
    m.querySelectorAll<HTMLElement>("[data-mark-filter]").forEach(button => button.onclick = () => {
      filter = button.dataset.markFilter!;
      m.querySelectorAll<HTMLElement>("[data-mark-filter]").forEach(tab => tab.setAttribute("aria-selected", String(tab === button)));
      renderMarks();
    });
    m.querySelector(".marks-list")!.addEventListener("click", async event => {
      const button = (event.target as Element).closest<HTMLElement>("[data-mark-go],[data-mark-edit],[data-mark-delete]");
      if (!button) return;
      const id = button.dataset.markGo ?? button.dataset.markEdit ?? button.dataset.markDelete;
      const mark = this.marks.find(mark => mark.id === id);
      if (!mark) return;
      try {
        if (button.dataset.markGo) { await this.go(mark.location); closeModal(); }
        else if (button.dataset.markEdit) await this.editMark(mark);
        else { await this.removeMark(mark); renderMarks(); }
      } catch (error) { toast((error as Error).message, true); }
    });
    m.querySelector("#export-marks")!.addEventListener("click", () => exportNotes(this.book.id).catch(error => toast(error.message, true)));
    m.querySelector("#readwise-marks")!.addEventListener("click", () => exportReadwise(this.book.id).catch(error => toast(error.message, true)));
    renderMarks();
  }
  private async editMark(mark: Mark) {
    if (mark.type !== "bookmark") {
      this.selected = { quote: mark.quote, location: mark.location, markId: mark.id, quads: mark.quads };
      this.selectionStyle = mark.style ?? "Highlight";
      this.editSelectionNote();
      return;
    }
    const note = await inputDialog(
      "Edit note",
      "Your note",
      mark.note,
      "text",
      true,
    );
    if (note === null) return;
    mark.note = note;
    if (mark.type !== "bookmark") mark.type = note ? "note" : "highlight";
    mark.updated = Date.now();
    await db.putMark(mark);
    if (this.pdf && this.book.format === "pdf" && mark.type !== "bookmark") {
      await this.rpc("editAnnotation", {
        page: mark.location,
        id: mark.id,
        text: note,
      });
      await this.savePDF();
      await this.renderPDF();
    }
    toast("Note updated.");
  }
  search() {
    const m = modal(
      "Find in this book",
      `<form id="book-search" class="search-form"><div class="search-input">${icon("search", 18)}<input name="query" required placeholder="A word, a phrase, a thought…" autocomplete="off"></div><button class="primary">Search</button></form><div id="search-results"><p class="empty-small">Search across the entire book.</p></div>`,
    );
    m.querySelector("form")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = (m.querySelector("input") as HTMLInputElement).value.trim(),
        out = m.querySelector("#search-results")!;
      out.innerHTML = '<p class="empty-small">Searching…</p>';
      try {
        const results: { location: string | number; excerpt: string }[] = [];
        if (this.pdf) {
          const found = await this.rpc("search", { query: q });
          for (const x of found)
            results.push({
              location: x.page,
              excerpt:
                "Page " + (x.page + 1) + " · " + x.quads.length + " match(es)",
            });
        } else
          for await (const result of this.view.search({
            query: q,
            matchCase: false,
            matchWholeWords: false,
          })) {
            if (result.subitems)
              for (const item of result.subitems)
                results.push({
                  location: item.cfi,
                  excerpt:
                    typeof item.excerpt === "string"
                      ? item.excerpt
                      : Object.values(item.excerpt ?? {}).join(""),
                });
            if (results.length >= 200) break;
          }
        out.innerHTML =
          `<p class="results-count">${results.length}${results.length >= 200 ? "+" : ""} results</p>` +
          results
            .map(
              (r, i) =>
                `<button class="search-result" data-result="${i}">${E(r.excerpt)}${icon("arrow", 16)}</button>`,
            )
            .join("");
        out.querySelectorAll<HTMLElement>("[data-result]").forEach((b) =>
          b.addEventListener("click", () => {
            this.go(results[Number(b.dataset.result)].location);
            closeModal();
          }),
        );
      } catch (e) {
        out.textContent = (e as Error).message;
      }
    });
  }
  private async speech() {
    if (this.speaking) {
      if (isNative()) await native("speechControl", { action: "stop" });
      else speechSynthesis.cancel();
      this.speaking = false;
      this.clearSpeechPanel();
      toast("Read aloud stopped.");
      return;
    }
    const s = this.settings;
    const m = modal(
      "Read aloud",
      `<p class="speech-book">${E(this.book.title)}</p>${voicePickerHTML()}${range("ttsRate", "Reading speed", s.ttsRate, 0.5, 2.5, 0.1, "×")}<div class="speech-speeds">${[.75,1,1.25,1.5,2].map(rate=>`<button data-speech-rate="${rate}" aria-pressed="${rate===s.ttsRate}">${rate}×</button>`).join("")}</div><label class="select-field"><span>Sleep timer</span><select id="speech-sleep"><option value="0">Off</option><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label><details class="voice-advanced speech-tuning"><summary>Fine-tune voice ${icon("down",16)}</summary>${range("ttsPitch", "Voice pitch", s.ttsPitch, 0.5, 2, 0.1)}<p class="small">Keep pitch at 1 for the original voice. Books continues through chapters with your screen off on Android.</p></details><div class="dialog-actions"><button class="primary full-width" id="start-speech" disabled>${icon("play",18)} Start reading aloud</button></div>`,
    );
    this.bindSettings(m);
    let preparing=false;
    const voices=bindVoicePicker(m,s,()=>this.persistSettings());
    m.classList.add('speech-dialog');
    m.querySelector('.modal-body')!.append(m.querySelector('.voice-setup')!);
    const speechActions=m.querySelector<HTMLElement>('.dialog-actions')!;speechActions.classList.add('speech-primary-action');m.append(speechActions);
    m.addEventListener('modalclose',()=>{if(preparing){this.speaking=false;this.clearSpeechPanel();if(isNative())void native('speechControl',{action:'stop'}).catch(()=>{});}},{once:true});
    m.querySelectorAll<HTMLElement>('[data-speech-rate]').forEach(b=>b.onclick=()=>{const input=m.querySelector<HTMLInputElement>('[data-setting=ttsRate]')!;input.value=b.dataset.speechRate!;input.dispatchEvent(new Event('input',{bubbles:true}));m.querySelectorAll('[data-speech-rate]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)))});
    await voices.ready;
    if(!m.isConnected)return;
    m.querySelector("#start-speech")!.addEventListener("click", async () => {
      const startButton=m.querySelector<HTMLButtonElement>("#start-speech")!;startButton.disabled=true;
      try {
        let text = this.currentText;
        if (!this.pdf) {
          const contents = this.view.renderer.getContents();
          const item =
            contents.find((x: any) => x.index === this.currentSection) ??
            contents[0];
          if (item) {
            const r = item.doc.createRange(),
              start = this.view.lastLocation?.range;
            try {
              r.selectNodeContents(item.doc.body);
              if (start) r.setStart(start.startContainer, start.startOffset);
              text = r.toString();
            } catch {
              text = item.doc.body.textContent;
            }
          }
        }
        if (!text.trim())
          throw Error(
            "This page has no selectable text. Scanned image pages need OCR before speech.",
          );
        const minutes = Number(
          m.querySelector<HTMLSelectElement>("#speech-sleep")!.value,
        );
        this.ttsSleepAt = minutes ? Date.now() + minutes * 60000 : 0;
        await voices.stop();
        this.speaking = true;
        this.paused = false;
        preparing=true;
        await this.playSpeech(text);
        preparing=false;
        if(!this.speaking||!m.isConnected)return;
        clearTimeout(this.sleepTimer);
        if (minutes)
          this.sleepTimer = setTimeout(() => {
            void this.perform("speech-stop");
            toast("Sleep timer finished.");
          }, minutes * 60000);
        closeModal();
      } catch (e) {
        preparing=false;this.speaking=false;this.clearSpeechPanel();startButton.disabled=false;
        toast((e as Error).message, true);
      }
    });
  }
  private prepareText(text: string) {
    for (const line of this.settings.replacements.split("\n")) {
      const at = line.indexOf("=>");
      if (at >= 0) {
        const from = line.slice(0, at).trim(),
          to = line.slice(at + 2).trim();
        if (from) text = text.split(from).join(to);
      }
    }
    return this.settings.trimSpaces
      ? text
          .replace(/[ \t]+/g, " ")
          .replace(/\n[ \t]*\n+/g, "\n")
          .trim()
      : text;
  }
  private async playSpeech(text: string) {
    if (!text.trim()) return this.continueSpeech();
    this.showSpeechPanel(text);
    if (isNative()) {
      const status=this.root.querySelector(".tts-counter");if(status)status.textContent="Preparing…";
      const location = this.pdf ? this.page : this.currentSection,
        sections = [{ text, location }];
      if (this.pdf) {
        for (let page = this.page + 1; page < this.count; page++) {
          const result = await this.rpc("text", { page });
          if (result.text?.trim())
            sections.push({ text: result.text, location: page });
        }
      } else
        for (
          let index = this.currentSection + 1;
          index < this.engine.sections.length;
          index++
        ) {
          if(this.closing||!this.speaking)return;
          if(this.engine.sections[index].linear === "no" || !this.engine.sections[index].createDocument)continue;
          const doc: Document = await this.engine.sections[index].createDocument();
          const source = this.prepareText(
            (
              doc.body ??
              doc.getElementsByTagNameNS("*", "body")[0] ??
              doc.documentElement
            )?.textContent ?? "",
          );
          if (source.trim()) sections.push({ text: source, location: index });
        }
      if(this.closing||!this.speaking)return;
      this.nativeSpeechQueue = true;
      await native("speak", {
        sections,
        bookId: this.book.id,
        title: this.book.title,
        rate: this.settings.ttsRate,
        pitch: this.settings.ttsPitch,
        engine: this.settings.ttsEngine, voice: this.settings.ttsVoice,
        sleepAt: this.ttsSleepAt,
      });
    } else {
      // Keep browser playback sentence-sized so transport controls also work in preview.
      const Segmenter=(Intl as any).Segmenter;
      this.browserSpeech=Segmenter ? Array.from(new Segmenter(undefined,{granularity:"sentence"}).segment(text),(part:any)=>({text:part.segment.trim(),start:part.index})).filter(x=>x.text) : (text.match(/[^.!?]+[.!?]*/g)??[text]).map(text=>({text:text.trim(),start:0}));
      this.browserSpeechIndex=0;this.playBrowserSentence();
    }
  }
  private playBrowserSentence() {
    const generation=++this.speechGeneration;
    speechSynthesis.cancel();
    if(!this.speaking||this.closing)return;
    const sentence=this.browserSpeech[this.browserSpeechIndex];
    if(!sentence){void this.continueSpeech();return;}
    this.paused=false;
    const utterance=new SpeechSynthesisUtterance(sentence.text);
    utterance.rate=this.settings.ttsRate;utterance.pitch=this.settings.ttsPitch;
    utterance.voice=speechSynthesis.getVoices().find(v=>v.name===this.settings.ttsVoice)??null;
    void this.speechEvent({state:"playing",text:sentence.text,index:this.browserSpeechIndex,count:this.browserSpeech.length});
    utterance.onboundary=e=>{if(generation!==this.speechGeneration||!this.speaking)return;void this.speechEvent({state:"range",location:this.pdf?this.page:this.currentSection,text:sentence.text,rangeStart:e.charIndex,rangeEnd:e.charIndex+Math.max(1,e.charLength||sentence.text.slice(e.charIndex).match(/^\S+/)?.[0].length||1)});};
    utterance.onend=()=>{if(generation!==this.speechGeneration||!this.speaking)return;this.browserSpeechIndex++;this.playBrowserSentence()};
    utterance.onerror=e=>{if(generation!==this.speechGeneration||!this.speaking||e.error==="canceled"||e.error==="interrupted")return;this.speaking=false;this.clearSpeechPanel();toast("This voice could not play. Choose another installed voice.",true)};
    speechSynthesis.speak(utterance);
  }
  private async continueSpeech() {
    if (!this.speaking || this.closing) return;
    if (this.ttsSleepAt && Date.now() >= this.ttsSleepAt) {
      await this.perform("speech-stop");
      return;
    }
    if (this.pdf && this.page + 1 < this.count) {
      this.page++;
      await this.renderPDF();
      await this.playSpeech(this.currentText);
      return;
    }
    if (!this.pdf && this.currentSection + 1 < this.engine.sections.length) {
      await this.view.goTo(this.currentSection + 1);
      const item = this.view.renderer.getContents()[0];
      if (item) await this.playSpeech(item.doc.body.textContent ?? "");
      return;
    }
    await this.perform("speech-stop");
  }
  private showSpeechPanel(text: string) {
    let panel = this.root.querySelector<HTMLElement>(".tts-now-playing");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "tts-now-playing";
      panel.innerHTML = `<div class="tts-player-heading"><span>${icon("headphones",15)} Reading aloud</span><small class="tts-counter"></small></div><span class="tts-current-line"></span><div class="tts-transport"><button data-action="speech-previous" aria-label="Previous sentence">${icon("prev", 17)}</button><button data-action="speech-pause" aria-label="Pause or resume speech">${icon("pause", 17)}</button><button data-action="speech-next" aria-label="Next sentence">${icon("next", 17)}</button><button data-action="speech-stop" aria-label="Stop speech">${icon("close", 17)}</button></div><progress class="tts-progress" max="1" value="0" aria-label="Read aloud progress"></progress>`;
      this.root.append(panel);
    }
    panel.querySelector(".tts-current-line")!.textContent = text.slice(0, 160);
  }
  private clearSpeechPanel() {
    this.root.querySelector(".tts-now-playing")?.remove();
    this.speechOverlay?.remove("books-speech");
    this.speechOverlay = undefined;
    this.speechTextCache = undefined;
  }
  private async speechEvent(data: any) {
    if(data.bookId && data.bookId!==this.book.id)return;
    if (data.state === "stopped") {
      this.speaking = false;
      this.clearSpeechPanel();
      return;
    }
    if (!this.speaking) return;
    if (data.state === "error") {
      toast(data.error || "The speech engine stopped.", true);
      this.speaking = false;
      this.clearSpeechPanel();
      return;
    }
    if (data.state === "finished") {
      if (this.nativeSpeechQueue) {
        this.speaking = false;
        this.clearSpeechPanel();
      } else await this.continueSpeech();
      return;
    }
    if (
      data.state === "playing" &&
      Number.isInteger(data.location) &&
      data.location >= 0
    ) {
      if (this.pdf && this.page !== data.location) await this.go(data.location);
      else if (!this.pdf && this.currentSection !== data.location)
        await this.view.goTo(data.location);
    }
    if(data.state === "range") {
      if((this.pdf ? this.page : this.currentSection) === data.location)this.highlightSpeech(data.text ?? "",data.rangeStart,data.rangeEnd);
      const line=this.root.querySelector('.tts-current-line'),text=String(data.text??"");
      if(line&&data.rangeEnd>data.rangeStart)line.innerHTML=`${E(text.slice(0,data.rangeStart))}<mark>${E(text.slice(data.rangeStart,data.rangeEnd))}</mark>${E(text.slice(data.rangeEnd))}`;
      return;
    }
    this.paused = data.state === "paused";
    this.showSpeechPanel(data.text ?? "");
    const counter=this.root.querySelector('.tts-counter'),progress=this.root.querySelector<HTMLProgressElement>('.tts-progress');
    if(counter)counter.textContent=data.count?`${Math.min(data.index+1,data.count)} / ${data.count}`:"";
    if(progress){progress.max=Math.max(1,data.count||1);progress.value=(data.index||0)+1;}
    const button = this.root.querySelector<HTMLElement>(
      '.tts-now-playing [data-action="speech-pause"]',
    );
    if (button) button.innerHTML = icon(this.paused ? "play" : "pause", 17);
    if (data.state === "playing") this.highlightSpeech(data.text ?? "");
  }
  private highlightSpeech(text: string, wordStart = 0, wordEnd = text.trim().length) {
    if (!this.view || !text.trim()) return;
    const item = this.view.renderer.getContents()[0];
    if (!item) return;
    const doc:Document=item.doc;
    let cache=this.speechTextCache;
    if(!cache || cache.doc!==doc){
      const nodes:{node:Node;start:number;end:number}[]=[],walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);let offset=0;
      while(walker.nextNode()){const node=walker.currentNode,len=node.textContent?.length??0;nodes.push({node,start:offset,end:offset+len});offset+=len;}
      cache=this.speechTextCache={doc,source:doc.body.textContent??"",nodes,sentence:"",index:0};
      const visible=this.view.lastLocation?.range?.startContainer;cache.index=nodes.find(n=>n.node===visible)?.start??0;
    }
    const sentence=text.trim();
    if(cache.sentence!==sentence){let next=cache.source.indexOf(sentence,cache.index+(cache.sentence?.length??0));if(next<0)next=cache.source.indexOf(sentence);if(next<0)return;cache.index=next;cache.sentence=sentence;}
    const from=cache.index+Math.max(0,wordStart),to=cache.index+Math.min(wordEnd,sentence.length);
    if(to<=from)return;
    const locate=(offset:number,end=false)=>{let low=0,high=cache!.nodes.length-1;while(low<=high){const mid=(low+high)>>1,n=cache!.nodes[mid];if(offset<n.start)high=mid-1;else if(offset>n.end||(!end&&offset===n.end))low=mid+1;else return n}return undefined};
    const first=locate(from),last=locate(to,true),start=first?.node,end=last?.node,a=from-(first?.start??0),b=to-(last?.start??0);
    if (!start || !end) return;
    const r = doc.createRange();
    r.setStart(start, a);
    r.setEnd(end, b);
    this.speechOverlay?.remove("books-speech");
    this.speechOverlay = item.overlayer;
    this.speechOverlay?.add("books-speech", r, this.highlightDraw, {
      color: themes[this.settings.theme]?.accent ?? "#d5b981",
      opacity: .24,
      writingMode: doc.defaultView?.getComputedStyle(doc.body).writingMode,
    });
    if(wordStart===0)this.view.renderer.scrollToAnchor?.(r, false);
  }
  private stopAutoScroll() {
    if (this.autoTimer !== undefined) cancelAnimationFrame(this.autoTimer);
    this.autoTimer = undefined;
    this.view?.renderer?.reportLocation?.();
    this.root.querySelector(".autoscroll-controls")?.remove();
  }
  private autoScroll() {
    if (this.autoTimer !== undefined) {
      this.stopAutoScroll();
      toast("Auto-scroll paused.");
      return;
    }
    const m = modal(
      "Settle into the flow",
      `${select("autoMode", "Scroll mode", this.settings.autoMode, { pixel: "Smooth pixels", line: "Line by line", page: "Page by page", half: "Half a page", blind: "Rolling focus" })}${range("autoSpeed", "Scroll speed", this.settings.autoSpeed, 5, 150, 5)}<div class="dialog-actions"><button class="primary" id="start-auto">${icon("play", 16)} Start auto-scroll</button></div><p class="muted small">Open this menu again to pause. Speed is pixels per second in smooth mode.</p>`,
    );
    this.bindSettings(m);
    m.querySelector("#start-auto")!.addEventListener("click", async () => {
      const mode = this.settings.autoMode;
      const previousFlow = this.settings.flow, previousRuler = this.settings.ruler;
      if (!this.pdf && !["page", "half"].includes(mode)) {
        this.settings.flow = "scrolled";
      }
      if (mode === "blind") {
        this.settings.ruler = "window";
      }
      if (this.settings.flow !== previousFlow || this.settings.ruler !== previousRuler) {
        this.applySettings();
        try { await this.persistSettings(); }
        catch (error) { toast((error as Error).message, true); return; }
        if (this.closing || !m.isConnected) return;
      }
      let elapsed = 0,
        pixels = 0,
        lastFrame = performance.now(),
        advancing = false;
      const advance = async (distance?: number) => {
        if (advancing || this.turning) return;
        const r = this.view?.renderer;
        const index = r?.getContents()[0]?.index ?? 0;
        const atEnd = this.pdf
          ? this.page + 1 >= this.count
          : this.settings.flow === "scrolled"
            ? r.end >= r.viewSize - 2 &&
              !this.engine.sections
                .slice(index + 1)
                .some((s: any) => s.linear !== "no")
            : r.atEnd;
        if (atEnd) {
          this.stopAutoScroll();
          return;
        }
        advancing = true;
        try {
          if (distance && !this.pdf) await r.next(distance);
          else await this.perform("next");
        } catch (error) {
          this.stopAutoScroll();
          toast((error as Error).message, true);
        } finally {
          advancing = false;
        }
      };
      const frame = (now: number) => {
        if (this.closing || this.autoTimer === undefined) return;
        this.autoTimer = requestAnimationFrame(frame);
        const delta = Math.min(64, Math.max(0, now - lastFrame));
        lastFrame = now;
        if (document.hidden || document.querySelector(".modal") || advancing)
          return;
        elapsed += delta;
        if (["pixel", "line", "blind"].includes(mode)) {
          const viewport =
            this.root.querySelector<HTMLElement>("#book-viewport")!;
          const r = this.view?.renderer;
          const atBottom = this.pdf
            ? viewport.scrollTop + viewport.clientHeight >=
              viewport.scrollHeight - 2
            : r.end >= r.viewSize - 2;
          if (atBottom) {
            void advance();
            return;
          }
          let distance = 0;
          if (mode === "line") {
            if (elapsed >= Math.max(150, 3000 - this.settings.autoSpeed * 15)) {
              elapsed = 0;
              distance = this.settings.fontSize * this.settings.lineHeight;
            }
          } else {
            // Retain fractional pixels so low speeds do not round to zero on
            // high refresh screens. Time-based movement survives frame drops.
            pixels += (this.settings.autoSpeed * delta) / 1000;
            distance = Math.floor(pixels);
            pixels -= distance;
          }
          if (distance) {
            if (this.pdf) viewport.scrollTop += distance;
            else r.scrollBy(distance, distance);
          }
        } else if (
          elapsed >= Math.max(1000, 18000 - this.settings.autoSpeed * 100)
        ) {
          elapsed = 0;
          void advance(
            mode === "half" && !this.pdf
              ? this.root.clientHeight / 2
              : undefined,
          );
        }
      };
      this.autoTimer = requestAnimationFrame(frame);
      closeModal();
      const panel = document.createElement("div");
      panel.className = "autoscroll-controls";
      panel.innerHTML =
        '<button data-auto-speed="-5" aria-label="Slower">−</button><span></span><button data-auto-speed="5" aria-label="Faster">+</button><button data-auto-stop aria-label="Stop auto-scroll">×</button>';
      const update = () => {
        panel.querySelector("span")!.textContent = String(
          this.settings.autoSpeed,
        );
      };
      update();
      panel.querySelectorAll<HTMLElement>("[data-auto-speed]").forEach(
        (button) =>
          (button.onclick = () => {
            this.settings.autoSpeed = Math.max(
              5,
              Math.min(
                150,
                this.settings.autoSpeed + Number(button.dataset.autoSpeed),
              ),
            );
            this.persistSettings();
            update();
          }),
      );
      panel.querySelector<HTMLElement>("[data-auto-stop]")!.onclick = () =>
        this.autoScroll();
      this.root.append(panel);
      toast("Auto-scroll started.");
    });
  }
  private more() {
    const s = this.settings;
    const m = modal(
      "Miscellaneous",
      `<div class="option-buttons"><button class="option-row" id="auto-option">${icon("play")}<span>${this.autoTimer ? "Pause" : "Start"} auto-scroll</span>${icon("chevron", 16)}</button>${this.pdf && this.book.format === "pdf" ? `<button class="option-row" id="pdf-pen">${icon("pencil")}<span>${this.pen ? "Finish handwriting" : "Handwrite on this PDF"}</span>${icon("chevron", 16)}</button><button class="option-row" id="pdf-text">${icon("file")}<span>Add a text annotation</span>${icon("chevron", 16)}</button><button class="option-row" id="pdf-annotations">${icon("highlight")}<span>PDF annotation list</span>${icon("chevron", 16)}</button>${this.book.sourceUri ? `<button class="option-row" id="pdf-original"><span>Save PDF to original file</span></button>` : ""}<button class="option-row" id="pdf-export">${icon("download")}<span>Export annotated PDF</span>${icon("chevron", 16)}</button><div class="pdf-zoom">${button("zoom-out", "Zoom out", "zoom-out")}<span>Pinch or use zoom controls</span>${button("zoom-in", "Zoom in", "zoom-in")}</div>` : this.pdf ? `<div class="pdf-zoom">${button("zoom-out", "Zoom out", "zoom-out")}<span>Document zoom</span>${button("zoom-in", "Zoom in", "zoom-in")}</div>` : ""}<button class="option-row" id="home-shortcut">${icon("plus")}<span>Add book to home screen</span>${icon("chevron", 16)}</button><button class="option-row" id="sync-position">${icon("cloud")}<span>Sync reading position & notes</span>${icon("chevron", 16)}</button></div>${select("orientation", "Screen orientation", s.orientation, orientationNames)}${toggle("keepAwake", "Keep screen awake", s.keepAwake)}${toggle("volumeKeys", "Volume keys turn pages", s.volumeKeys)}${toggle("shakeTTS", "Shake to read aloud", s.shakeTTS)}${toggle("tiltPages", "Tilt to turn pages", s.tiltPages)}${toggle("statusBar", "Reading progress bar", s.statusBar)}${toggle("scrollLock", "Lock horizontal scrolling", s.scrollLock)}${toggle("doubleTapZoom", "Double-tap to zoom images and PDF", s.doubleTapZoom)}<label class="field">Mini status bar<input data-setting="miniStatus" value="${E(s.miniStatus)}"></label>${select("tapLeft", "Tap left side", s.tapLeft, { previous: "Previous page", next: "Next page", toolbar: "Show controls", bookmark: "Bookmark", speech: "Read aloud", contents: "Contents", appearance: "Appearance" })}${select("tapCenter", "Tap center", s.tapCenter, { toolbar: "Show controls", next: "Next page", previous: "Previous page", speech: "Read aloud", appearance: "Appearance" })}${select("tapRight", "Tap right side", s.tapRight, { next: "Next page", previous: "Previous page", toolbar: "Show controls", bookmark: "Bookmark", speech: "Read aloud" })}${select("swipeUp", "Swipe up", s.swipeUp, { "font-up": "Larger text", "font-down": "Smaller text", next: "Next page", previous: "Previous page", toolbar: "Show controls" })}${select("swipeDown", "Swipe down", s.swipeDown, { "font-down": "Smaller text", "font-up": "Larger text", next: "Next page", previous: "Previous page", toolbar: "Show controls" })}${range("eyeReminder", "Eye break reminder", s.eyeReminder, 0, 60, 5, " min")}<label class="field"><span>Name & phrase replacements</span><textarea id="replacements" rows="4" placeholder="Alice => Maya&#10;old name => new name">${E(s.replacements)}</textarea><small>One replacement per line.</small><button class="secondary" type="button" id="apply-replacements">Apply replacements</button></label><div class="reader-shortcuts"><span>KEYBOARD</span><p>← → turn pages · B bookmark · T appearance · F search</p></div>`,
    );
    this.bindSettings(m);
    m.querySelector("#apply-replacements")!.addEventListener(
      "click",
      async () => {
        s.replacements =
          m.querySelector<HTMLTextAreaElement>("#replacements")!.value;
        await this.persistSettings();
        closeModal();
        await this.reopenText();
      },
    );
    m.querySelector("#replacements")!.addEventListener("change", (e) => {
      s.replacements = (e.target as HTMLTextAreaElement).value;
      this.persistSettings();
    });
    m.querySelector("#auto-option")!.addEventListener("click", () =>
      this.autoScroll(),
    );
    m.querySelector("#home-shortcut")!.addEventListener("click", () =>
      native("shortcut", { id: this.book.id, title: this.book.title })
        .then(() => toast("Shortcut requested."))
        .catch((e) => toast(e.message, true)),
    );
    m.querySelector("#sync-position")!.addEventListener("click", () =>
      this.flush()
        .then(() => sync())
        .then(() => toast("Reading position and notes synced."))
        .catch((e) => toast(e.message, true)),
    );
    m.querySelectorAll<HTMLElement>("[data-action]").forEach((b) =>
      b.addEventListener("click", () => this.perform(b.dataset.action!)),
    );
    m.classList.add("reader-options");
    m
      .querySelector("#pdf-annotations")
      ?.addEventListener("click", () => this.pdfAnnotations());
    m.querySelector("#pdf-pen")?.addEventListener("click", () => {
      this.pen = !this.pen;
      this.root
        .querySelectorAll(".pdf-ink")
        .forEach((el) => el.classList.toggle("active", this.pen));
      closeModal();
      toast(
        this.pen
          ? "Draw directly on the page. Strokes save automatically."
          : "Handwriting saved.",
      );
    });
    m.querySelector("#pdf-original")?.addEventListener("click", async () => {
      if (
        this.book.sourceUri &&
        (await confirmDialog(
          "Save PDF to original file?",
          "Replace the original document with this annotated PDF?",
          "Save",
        ))
      ) {
        try {
          await writeOriginal(this.book.sourceUri, this.book.blob);
          toast("PDF saved to original file.");
        } catch (error) {
          toast((error as Error).message, true);
        }
      }
    });
    m.querySelector("#pdf-export")?.addEventListener("click", async () => {
      try {
        await saveFile(
          this.book.filename.replace(/\.pdf$/i, "") + "-annotated.pdf",
          new Blob([await this.rpc("save")], { type: "application/pdf" }),
        );
        toast("PDF exported.");
      } catch (e) {
        toast((e as Error).message, true);
      }
    });
    m.querySelector("#pdf-text")?.addEventListener("click", async () => {
      const text = await inputDialog("Add a PDF annotation", "Annotation text");
      if (text) {
        await this.rpc("annotate", {
          page: this.page,
          type: "FreeText",
          rect: [
            this.pdfBounds[0] + 30,
            this.pdfBounds[1] + 30,
            this.pdfBounds[0] + 250,
            this.pdfBounds[1] + 100,
          ],
          text,
          color: [1, 0.85, 0.3],
        });
        await this.savePDF();
        await this.renderPDF();
        toast("Text annotation added near the top of this page.");
      }
    });
  }
  private async pdfAnnotations() {
    const annotations = await this.rpc("annotations");
    const m = modal(
      "PDF annotation list",
      `<div>${annotations.map((a: any, i: number) => `<article class="mark-card"><div class="mark-meta">Page ${a.page + 1} · ${E(a.type)}</div><button class="mark-quote" data-pdf-go="${i}">${E(a.text || a.type)}</button><div class="mark-actions"><button class="subtle" data-pdf-edit="${i}">Edit</button><button class="subtle" data-pdf-delete="${i}">Delete</button></div></article>`).join("") || '<p class="empty-small">No annotations</p>'}</div>`,
    );
    m.querySelectorAll<HTMLElement>("[data-pdf-go]").forEach(
      (b) =>
        (b.onclick = () => {
          this.go(annotations[Number(b.dataset.pdfGo)].page);
          closeModal();
        }),
    );
    m.querySelectorAll<HTMLElement>("[data-pdf-edit]").forEach(
      (b) =>
        (b.onclick = async () => {
          const a = annotations[Number(b.dataset.pdfEdit)];
          const mark = this.marks.find(mark => mark.type !== "bookmark" && mark.id === a.id);
          if (mark) { await this.editMark(mark); return; }
          const text = await inputDialog("Edit annotation", "Text", a.text);
          if (text !== null) {
            await this.rpc("editAnnotation", {
              page: a.page,
              index: a.index,
              text,
            });
            await this.savePDF();
            await this.renderPDF();
            await this.pdfAnnotations();
          }
        }),
    );
    m.querySelectorAll<HTMLElement>("[data-pdf-delete]").forEach(
      (b) =>
        (b.onclick = async () => {
          const a = annotations[Number(b.dataset.pdfDelete)];
          const mark = this.marks.find(mark => mark.type !== "bookmark" && mark.id === a.id);
          if (mark) await this.removeMark(mark);
          else {
            await this.rpc("deleteAnnotation", { page: a.page, index: a.index });
            await this.savePDF();
            await this.renderPDF();
          }
          await this.pdfAnnotations();
        }),
    );
  }
  private async savePDF() {
    this.book.blob = new Blob([await this.rpc("save")], {
      type: "application/pdf",
    });
    this.pdfDirty = true;
    this.book.size = this.book.blob.size;
    await this.flush();
  }
  async close() {
    if (this.closing) return;
    this.closing = true;
    this.renderVersion++;
    clearInterval(this.timer);
    this.stopAutoScroll();
    clearTimeout(this.saveTimer);
    clearTimeout(this.selectionTimer);
    if (this.saveIdle !== undefined) cancelIdleCallback(this.saveIdle);
    clearTimeout(this.sleepTimer);
    await this.flush();
    this.abort.abort();
    if (this.speaking) {
      if (isNative())
        await native("speechControl", { action: "stop" }).catch(() => {});
      else speechSynthesis.cancel();
    }
    this.view?.close();
    this.engine?.destroy?.();
    this.pdf?.terminate();
    if (this.pdfURL) URL.revokeObjectURL(this.pdfURL);
    if (isNative()) {
      await native("readerOptions", {
        awake: false,
        shake: false,
        tilt: false,
        orientation: "auto",
        reading: false,
        volumeKeys: false,
      }).catch(() => {});
      await native("immersive", { value: false }).catch(() => {});
    }
    closeModal();
    this.root.hidden = true;
    this.root.replaceChildren();
    document.body.classList.remove("reading");
    this.onClose();
    if (isNative() && this.settings.autoSync) {
      native("getCloud")
        .then((cloud) => (cloud ? sync() : undefined))
        .catch(() =>
          toast("Cloud sync unavailable; changes are saved on this device."),
        );
    }
  }
}
