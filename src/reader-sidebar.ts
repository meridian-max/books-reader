import { modal, closeModal, icon, toast } from "./ui";
import { escapeHTML as E, type Book, type Mark } from "./types";
import { saveFile } from "./native";
type Picture = { url: string; blob: Blob; section: number; label: string };
type NavigatorOptions = {
  book: Book;
  toc: any[];
  marks: () => Mark[];
  engine: any;
  pageCount: number;
  pdf: boolean;
  section: number;
  go: (location: string | number) => Promise<unknown>;
  fraction: (value: number) => unknown;
  bookmark: () => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  renderPage: (page: number) => Promise<Blob>;
};
export function readerSidebar(o: NavigatorOptions, tab = "chapters") {
  const flatten = (items: any[], depth = 0): string =>
    items
      .map(
        (item) =>
          `<button class="toc-item" data-href="${E(o.pdf ? (item.page ?? item.uri ?? 0) : item.href)}" style="--depth:${Math.min(depth, 5)}"><span>${E(item.label ?? item.title ?? "Untitled section")}</span>${icon("chevron", 16)}</button>${flatten(item.subitems ?? item.down ?? [], depth + 1)}`,
      )
      .join("");
  const m = modal(
    "Book navigator",
    `<div class="navigator-book">${o.book.cover ? `<img src="${E(o.book.cover)}" alt="">` : icon("book", 32)}<div><strong>${E(o.book.title)}</strong><small>${Math.round(o.book.progress * 100)}% read</small></div></div><div class="navigator-tabs" role="tablist" aria-label="Book navigation">${[
      ["chapters", "Chapters"],
      ["bookmarks", "Bookmarks"],
      ["images", "Images"],
    ]
      .map(
        ([id, label]) =>
          `<button role="tab" data-reader-tab="${id}" aria-selected="${id === tab}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="navigator-panel" data-panel="chapters"><label class="navigator-search">${icon("search", 18)}<input type="search" placeholder="Find a chapter" aria-label="Find a chapter"></label><div class="toc-list">${flatten(o.toc) || '<p class="empty-small">This book has no table of contents.</p>'}</div><form id="goto-form" class="inline-form"><label>${o.pdf ? "Go to page" : "Go to percentage"}<input type="number" min="${o.pdf ? 1 : 0}" max="${o.pdf ? o.pageCount : 100}" name="location" required></label><button class="primary">Go</button></form></div><div class="navigator-panel" data-panel="bookmarks" hidden><button class="secondary full-width" id="navigator-add-bookmark">${icon("bookmark", 18)} Bookmark this position</button><label class="navigator-search navigator-saved-search">${icon("search", 18)}<input type="search" id="navigator-marks-search" placeholder="Search saved text" aria-label="Search bookmarks and saved text"></label><p class="navigator-saved-summary" role="status" aria-live="polite"></p><div class="navigator-bookmarks"></div></div><div class="navigator-panel" data-panel="images" hidden><p class="small">${o.pdf ? "Page previews. Open a page to read or save a preview image." : "Illustrations and photographs from this book. Tap an image to view it or return to its chapter."}</p><p class="gallery-status" role="status"></p><div class="book-image-grid"></div><button class="secondary full-width" id="gallery-more">Load images</button></div><div class="gallery-preview" hidden></div>`,
  );
  m.classList.add("reader-sidebar");
  m.parentElement!.classList.add("reader-sidebar-backdrop");
  let stopped = false,
    cursor = 0,
    loading = false,
    bytes = 0;
  const seen = new Set<string>(),
    pictures: Picture[] = [];
  m.addEventListener(
    "modalclose",
    () => {
      stopped = true;
      for (const image of pictures) URL.revokeObjectURL(image.url);
    },
    { once: true },
  );
  m.querySelectorAll<HTMLElement>("[data-href]").forEach(
    (b) =>
      (b.onclick = () => {
        void o.go(o.pdf ? Number(b.dataset.href) : b.dataset.href!);
        closeModal();
      }),
  );
  m.querySelector<HTMLInputElement>(".navigator-search input")!.oninput = (
    e,
  ) => {
    const q = (e.target as HTMLInputElement).value.toLocaleLowerCase();
    m.querySelectorAll<HTMLElement>(".toc-item").forEach(
      (el) => (el.hidden = !el.textContent?.toLocaleLowerCase().includes(q)),
    );
  };
  m.querySelector<HTMLFormElement>("#goto-form")!.onsubmit = (e) => {
    e.preventDefault();
    const n = Number(
      m.querySelector<HTMLInputElement>("[name=location]")!.value,
    );
    o.pdf ? void o.go(n - 1) : o.fraction(n / 100);
    closeModal();
  };
  const markLabel = (mark: Mark) => {
    if (mark.type === "bookmark") return "Page bookmark";
    const style =
      {
        Highlight: "Highlight",
        Underline: "Underline",
        StrikeOut: "Strikethrough",
        Squiggly: "Wavy underline",
      }[mark.style ?? "Highlight"] ?? "Highlight";
    return mark.note ? `${style} · Note` : style;
  };
  const search = m.querySelector<HTMLInputElement>("#navigator-marks-search")!;
  const marks = () => {
    const list = m.querySelector(".navigator-bookmarks")!;
    const saved = o
      .marks()
      .filter((mark) => !mark.deleted && mark.bookId === o.book.id);
    const query = search.value.trim().toLocaleLowerCase();
    const entries = saved
      .filter(
        (mark) =>
          !query ||
          `${mark.quote} ${mark.note} ${markLabel(mark)}`
            .toLocaleLowerCase()
            .includes(query),
      )
      .sort(
        (a, b) =>
          String(a.location).localeCompare(String(b.location), undefined, {
            numeric: true,
          }) || a.created - b.created,
      );
    m.querySelector(".navigator-saved-summary")!.textContent = query
      ? `${entries.length} of ${saved.length} saved items`
      : `${saved.length} saved ${saved.length === 1 ? "item" : "items"}`;
    list.innerHTML =
      entries
        .map((mark) => {
          const label = markLabel(mark);
          const color = /^#[0-9a-f]{6}$/i.test(mark.color)
            ? mark.color
            : "#e8cb83";
          return `<article class="navigator-mark" data-mark-id="${E(mark.id)}" data-mark-kind="${mark.type}" style="--mark-color:${color}"><button data-mark-go="${E(mark.id)}" title="Return to this ${mark.type === "bookmark" ? "page" : "passage"}"><span class="navigator-mark-copy"><span class="navigator-mark-label">${icon(mark.type === "bookmark" ? "bookmark" : mark.note ? "pencil" : "highlight", 15)}${E(label)}</span><span class="navigator-mark-quote">${E(mark.quote || (mark.type === "bookmark" ? "Saved position" : "Saved passage"))}</span>${mark.note ? `<span class="navigator-mark-note">${E(mark.note)}</span>` : ""}<small>${typeof mark.location === "number" ? `Page ${mark.location + 1} · ` : ""}${new Date(mark.created).toLocaleDateString()}</small></span></button><button class="icon-button" data-mark-remove="${E(mark.id)}" aria-label="Remove ${E(label.toLocaleLowerCase())}">${icon("trash", 16)}</button></article>`;
        })
        .join("") ||
      `<div class="navigator-empty">${icon(query ? "search" : "bookmark", 32)}<h3>${query ? "No matching saved text" : "Your saved pages and passages"}</h3><p>${query ? "Try another word from the passage or note." : "Bookmarks, highlights, underlines and notes appear here. Select text in the book or bookmark a page to save it."}</p></div>`;
    list.querySelectorAll<HTMLButtonElement>("[data-mark-go]").forEach(
      (b) =>
        (b.onclick = async () => {
          const mark = entries.find((x) => x.id === b.dataset.markGo);
          if (!mark) return;
          b.disabled = true;
          try {
            await o.go(mark.location);
            if (!stopped) closeModal();
          } catch (error) {
            toast((error as Error).message, true);
            if (!stopped) b.disabled = false;
          }
        }),
    );
    list.querySelectorAll<HTMLButtonElement>("[data-mark-remove]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            await o.remove(b.dataset.markRemove!);
            if (!stopped) marks();
          } catch (error) {
            toast((error as Error).message, true);
            if (!stopped) b.disabled = false;
          }
        }),
    );
  };
  search.oninput = marks;
  marks();
  m.querySelector<HTMLElement>("#navigator-add-bookmark")!.onclick =
    async () => {
      try {
        await o.bookmark();
        if (!stopped) {
          search.value = "";
          marks();
        }
      } catch (error) {
        toast((error as Error).message, true);
      }
    };
  const preview = m.querySelector<HTMLElement>(".gallery-preview")!;
  const show = (index: number) => {
    const image = pictures[index];
    if (!image) return;
    preview.hidden = false;
    m.classList.add("gallery-expanded");
    m.querySelector<HTMLElement>(".modal-header")!.inert = true;
    for (const el of Array.from(preview.parentElement!.children))
      if (el !== preview) (el as HTMLElement).inert = true;
    preview.innerHTML = `<header><button class="icon-button" data-gallery-back aria-label="Back to images">${icon("back")}</button><span>${index + 1} / ${pictures.length}</span><button class="icon-button" data-image-save aria-label="Save image">${icon("download")}</button></header><div class="gallery-image-stage"><img src="${E(image.url)}" alt="${E(image.label)}"></div><p>${E(image.label)}</p><div class="gallery-controls"><button class="icon-button" data-gallery-prev aria-label="Previous image" ${index === 0 ? "disabled" : ""}>${icon("prev")}</button><button class="primary" data-image-open>${o.pdf ? "Open page" : "Open chapter"}</button><button class="icon-button" data-gallery-next aria-label="Next image" ${index === pictures.length - 1 ? "disabled" : ""}>${icon("next")}</button></div>`;
    preview.querySelector<HTMLElement>("[data-gallery-back]")!.onclick = () => {
      preview.hidden = true;
      m.classList.remove("gallery-expanded");
      m.querySelector<HTMLElement>(".modal-header")!.inert = false;
      for (const el of Array.from(preview.parentElement!.children))
        if (el !== preview) (el as HTMLElement).inert = false;
      m.querySelector<HTMLElement>(`[data-image="${index}"]`)?.focus();
    };
    preview.querySelector<HTMLElement>("[data-gallery-prev]")!.onclick = () =>
      show(index - 1);
    preview.querySelector<HTMLElement>("[data-gallery-next]")!.onclick = () =>
      show(index + 1);
    preview.querySelector<HTMLElement>("[data-image-open]")!.onclick = () => {
      void o.go(image.section);
      closeModal();
    };
    preview.querySelector<HTMLElement>("[data-image-save]")!.onclick = () => {
      const ext =
        (
          {
            "image/svg+xml": "svg",
            "image/jpeg": "jpg",
            "image/webp": "webp",
            "image/gif": "gif",
            "image/avif": "avif",
            "image/bmp": "bmp",
            "image/png": "png",
          } as Record<string, string>
        )[image.blob.type] ?? "img";
      void saveFile(`Books-image-${index + 1}.${ext}`, image.blob).catch((e) =>
        toast(e.message, true),
      );
    };
    preview.querySelector<HTMLElement>("button")!.focus();
  };
  const append = (blob: Blob, section: number, label: string) => {
    if (stopped || !blob.size) return;
    if (blob.size > 24 * 1048576 || bytes + blob.size > 96 * 1048576)
      throw Error(
        "This image batch is too large. Close the gallery to free memory and read the image in its chapter.",
      );
    bytes += blob.size;
    const image = { blob, section, label, url: URL.createObjectURL(blob) },
      i = pictures.push(image) - 1;
    const button = document.createElement("button");
    button.dataset.image = String(i);
    button.setAttribute("aria-label", `View ${label}`);
    button.innerHTML = `<img src="${E(image.url)}" alt="" loading="lazy" decoding="async"><span>${E(label)}</span>`;
    button.onclick = () => show(i);
    m.querySelector(".book-image-grid")!.append(button);
  };
  const load = async () => {
    if (loading || stopped) return;
    loading = true;
    const more = m.querySelector<HTMLButtonElement>("#gallery-more")!,
      status = m.querySelector<HTMLElement>(".gallery-status")!;
    more.disabled = true;
    const count = o.pdf ? o.pageCount : (o.engine?.sections?.length ?? 0),
      end = Math.min(cursor + 8, count);
    try {
      while (cursor < end && !stopped) {
        const section = cursor++;
        status.textContent = `Finding images… ${cursor} / ${count}`;
        if (o.pdf)
          append(await o.renderPage(section), section, `Page ${section + 1}`);
        else {
          const part = o.engine.sections[section];
          let doc: Document;
          if (part.createDocument) doc = await part.createDocument();
          else {
            const url = await part.load();
            doc = new DOMParser().parseFromString(
              await (await fetch(url)).text(),
              "text/html",
            );
          }
          for (const el of doc.querySelectorAll("img,image")) {
            if (stopped) break;
            const source =
              el.getAttribute("src") ||
              el.getAttribute("href") ||
              el.getAttribute("xlink:href");
            if (!source) continue;
            const resolved = part.resolveHref?.(source) ?? source,
              key = resolved;
            if (seen.has(key)) continue;
            seen.add(key);
            let blob: Blob | undefined;
            if (/^(blob:|data:image\/)/i.test(source))
              blob = await (await fetch(source)).blob();
            else if (o.engine.loadBlob && o.engine.resources) {
              const item = o.engine.resources.getItemByHref(
                resolved.split("#")[0],
              );
              if (item && item.mediaType?.startsWith("image/"))
                blob = new Blob([await o.engine.loadBlob(item.href)], {
                  type: item.mediaType,
                });
            }
            if (blob)
              append(
                blob,
                section,
                el.getAttribute("alt") || `Image ${pictures.length + 1}`,
              );
          }
          for (const svg of doc.querySelectorAll("svg")) {
            if (stopped) break;
            if (svg.querySelector("image")) continue;
            const copy = svg.cloneNode(true) as Element;
            copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            const source = new XMLSerializer().serializeToString(copy);
            if (seen.has(source)) continue;
            seen.add(source);
            append(
              new Blob([source], { type: "image/svg+xml" }),
              section,
              svg.getAttribute("aria-label") ||
                svg.querySelector("title")?.textContent ||
                `Illustration ${pictures.length + 1}`,
            );
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!stopped)
        status.textContent = `${pictures.length} ${pictures.length === 1 ? "image" : "images"}${cursor < count ? " · more chapters available" : pictures.length ? "" : " found in this book"}`;
    } catch (error) {
      if (!stopped) status.textContent = (error as Error).message;
    } finally {
      loading = false;
      if (!stopped) {
        more.disabled = false;
        more.hidden = cursor >= count;
        more.textContent = "Load more images";
      }
    }
  };
  m.querySelector<HTMLElement>("#gallery-more")!.onclick = () => void load();
  const activate = (id: string) => {
    preview.hidden = true;
    m.classList.remove("gallery-expanded");
    m.querySelector<HTMLElement>(".modal-header")!.inert = false;
    for (const el of Array.from(preview.parentElement!.children))
      if (el !== preview) (el as HTMLElement).inert = false;
    m.querySelectorAll<HTMLElement>("[data-reader-tab]").forEach((el) =>
      el.setAttribute("aria-selected", String(el.dataset.readerTab === id)),
    );
    m.querySelectorAll<HTMLElement>("[data-panel]").forEach(
      (el) => (el.hidden = el.dataset.panel !== id),
    );
    if (id === "images" && !cursor) void load();
  };
  m.querySelectorAll<HTMLElement>("[data-reader-tab]").forEach(
    (b) => (b.onclick = () => activate(b.dataset.readerTab!)),
  );
  activate(tab);
  return m;
}
