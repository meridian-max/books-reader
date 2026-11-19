import {appThemeGallery, bindThemeFilters} from "./theme-studio";
import {downloadBook} from "./downloads";
import { languages, setLanguage } from "./i18n";
import "./style.css";
import "./reference.css";
import "./reader-controls.css";
import "./comfort.css";
import "./interface.css";
import "./highlight-ui.css";
import "./theme-studio.css";
import "./polish.css";
import "./richness.css";
import { mountMargins, renderJournal, passage, filterJournalByBook } from "./journal";
import { mountReadingPick } from "./reading-pick";
import { initMotion, enterPage } from './motion';
import { readingSummary } from './profile-data';
import { renderProfile, renderHistory } from './profile';
import { maybeAutoBackup } from './drive';
initMotion();
import { exportReadwise, readwiseSettings } from "./readwise";
import { browseFtp } from "./ftp";
import { db } from "./db";
import {
  createBook,
  expandArchive,
  ext,
  generatedCover,
  supported,
} from "./formats";
import { Reader } from "./reader";
import {
  defaults,
  appThemes,
  escapeHTML as E,
  uid,
  dateKey,
  type Book,
  type Mark,
  type Settings,
  type Session,
} from "./types";
import {
  icon,
  button,
  modal,
  closeModal,
  toast,
  confirmDialog,
  inputDialog,
  range,
  toggle,
  select,
} from "./ui";
import {
  backup,
  backupToCloud,
  restoreFromCloud,
  restore,
  exportNotes,
  sync,
  getCloud,
  setCloud,
  disconnectCloud,
} from "./backup";
import { isNative, native, network, saveFile, nativeFile } from "./native";

const app = document.querySelector<HTMLElement>("#app")!;
let books: Book[] = [],
  settings: Settings = { ...defaults },
  route = "home",
  filter = "all",
  query = "",
  reader: Reader | null = null,
  importing = false,
  collection = "",
  directoryStack: string[] = [];
const routes = [
  ["home", "book", "Home"],
  ["recent", "clock", "Recently opened"],
  ["library", "library", "Library"],
  ["files", "folder", "Files"],
  ["catalogs", "globe", "Discover"],
  ["downloads", "download", "Downloads"],
  ["notebook", "notebook", "Notes & highlights"],
  ["statistics", "stats", "Statistics"],
  ["profile", "user", "You"],
  ["history", "clock", "Reading history"],
];
let searchVisible = false;
let fileClipboard: {
  uri: string;
  parent: string;
  name: string;
  move: boolean;
} | null = null;
const shelfTitle = () =>
  ["author-books", "series-books", "rating-books"].includes(route) ? (route === "rating-books" ? `${collection} stars` : collection) :
  route === "home"
    ? "Books"
    : route === "favorites"
      ? "Favorites"
      : route === "downloads"
        ? "Downloads"
        : route === "collection"
          ? collection
          : route === "library"
            ? "Library"
            : route === "authors"
              ? "Authors"
              : route === "series" ? "Series" : route === "ratings" ? "My ratings" : route === "tags"
                ? "Tags"
                : route === "notebook"
                  ? "Notes & highlights"
                  : route === "settings"
                    ? "Settings"
                    : (routes.find((r) => r[0] === route)?.[2] ?? "Books");
let selectingBooks = false;
const selectedBooks = new Set<string>();
const sorted = () =>
  books
    .slice()
    .sort((a, b) =>
      settings.sort === "title"
        ? a.title.localeCompare(b.title)
        : settings.sort === "author"
          ? a.author.localeCompare(b.author)
          : settings.sort === "added"
            ? b.added - a.added
            : b.lastRead - a.lastRead || b.added - a.added,
    );
const coverCache = new WeakMap<Book, { title: string; author: string; url: string }>();
const cover = (b: Book) => {
  if (b.cover) return b.cover;
  const cached = coverCache.get(b);
  if (cached?.title === b.title && cached.author === b.author) return cached.url;
  const url = generatedCover(b.title, b.author);
  coverCache.set(b, { title: b.title, author: b.author, url });
  return url;
};
const BOOK_BATCH = 24;
type ShelfState = { top: number; limit: number; query: string; filter: string };
const pageStates = new Map<string, ShelfState>();
const pageKey = () => `${route}:${["collection", "author-books", "series-books", "rating-books"].includes(route) ? collection : ""}`;
let libraryObserver: IntersectionObserver | undefined;
let searchFrame = 0;
function rememberPage() {
  const page = app.querySelector<HTMLElement>("#page");
  if (!page?.dataset.key) return;
  pageStates.set(page.dataset.key, {
    top: page.scrollTop,
    limit: Number(page.querySelector<HTMLElement>("#books-grid")?.dataset.limit ?? BOOK_BATCH),
    query: page.querySelector<HTMLInputElement>("#library-search")?.value ?? "",
    filter: page.querySelector<HTMLElement>('[data-filter][aria-selected="true"]')?.dataset.filter ?? "all",
  });
}
const progress = (b: Book) => Math.round(b.progress * 100);
const minutes = (seconds: number) => Math.round(seconds / 60);
function shell() {
  const libraryRoutes = ["library", "favorites", "downloads", "collection", "recent", "authors", "series", "ratings", "author-books", "series-books", "rating-books", "tags"];
  const activeTab = libraryRoutes.includes(route) ? "library" : ["settings", "statistics", "history"].includes(route) ? "profile" : route;
  document.documentElement.dataset.motion = settings.motion;
  document.documentElement.dataset.appTheme = settings.appTheme;
  setLanguage(settings.language);
  updateAppChrome();
  const tabs = [["home", "book", "Home"], ["library", "library", "Library"], ["notebook", "notebook", "Notes"], ["profile", "user", "You"]];
  app.innerHTML = `<div class="app-shell"><header class="main-appbar"><button class="appbar-button" data-action="mobile-menu" aria-label="Open navigation" aria-expanded="false">${icon("menu", 22)}</button><div class="appbar-title"><span>${route === "home" ? '<span class="books-wordmark">books</span>' : E(shelfTitle())}</span></div><div class="appbar-actions">${button("search", "Search library", "focus-search", "appbar-button")}${route === "library" ? button("more", "More library options", "app-menu", "appbar-button") : ""}</div></header>
  <aside class="sidebar" aria-label="Navigation drawer" inert><div class="drawer-logo"><img src="/icon.svg" alt=""><div><strong>Books</strong><small>Book reader</small></div><button class="icon-button" data-action="close-drawer" aria-label="Close navigation">${icon("close")}</button></div><nav class="main-nav">${routes.map(([id, ic, label]) => `<button data-nav="${id}" aria-label="${E(label)}" class="nav-item ${route === id ? "active" : ""}" ${route === id ? 'aria-current="page"' : ""}>${icon(ic, 22)}<span>${label}</span>${id === "library" ? `<small>${books.length}</small>` : ""}</button>`).join("")}</nav><div class="drawer-tags">${[...new Set(books.flatMap(b => b.tags))].sort().map(tag => `<button class="nav-item" data-collection="${E(tag)}">${icon("bookmark", 20)}<span>${E(tag)}</span></button>`).join("")}</div><div class="drawer-bottom"><button data-nav="settings">${icon("settings", 22)}<span>Settings</span></button><button data-action="about">${icon("info", 22)}<span>About</span></button><button data-action="app-night">${icon(settings.appTheme !== "material" ? "sun" : "moon", 22)}<span>${settings.appTheme !== "material" ? "Light mode" : "Dark mode"}</span></button><button data-action="app-exit">${icon("back", 22)}<span>Exit</span></button></div></aside><button class="drawer-scrim" data-action="close-drawer" aria-label="Close navigation" hidden></button>
  <main id="page" class="page"></main><nav class="bottom-nav" aria-label="Main navigation">${tabs.map(([id, ic, label]) => `<button data-tab="${id}" class="${activeTab === id ? "active" : ""}" ${activeTab === id ? 'aria-current="page"' : ""}><span>${icon(ic, 22)}</span><small>${label}</small></button>`).join("")}</nav></div>`;
}
function updateAppChrome() {
  if (isNative()) native("chrome", {
    color: getComputedStyle(document.documentElement).getPropertyValue("--app-bar").trim(),
    darkIcons: appThemes[settings.appTheme]?.light ?? false,
  }).catch(() => {});
}
function drawer(open: boolean) {
  const sidebar = app.querySelector<HTMLElement>(".sidebar")!;
  sidebar.classList.toggle("mobile-open", open);
  sidebar.inert = !open;
  app.querySelector<HTMLElement>(".drawer-scrim")!.hidden = !open;
  app.querySelector('[data-action="mobile-menu"]')?.setAttribute("aria-expanded", String(open));
  app.querySelector<HTMLElement>("#page")!.inert = open;
  app.querySelector<HTMLElement>(".bottom-nav")!.inert = open;
  if (open) sidebar.querySelector<HTMLButtonElement>('[data-action="close-drawer"]')?.focus();
  else app.querySelector<HTMLButtonElement>('[data-action="mobile-menu"]')?.focus();
}
async function render() {
  const previous = app.querySelector<HTMLElement>("#page")?.dataset.key;
  rememberPage();
  libraryObserver?.disconnect();
  cancelAnimationFrame(searchFrame);
  const key = pageKey(), state = pageStates.get(key);
  if (previous !== key && state) { query = state.query; filter = state.filter; }
  shell();
  const page = app.querySelector<HTMLElement>("#page")!;
  page.dataset.key = key;
  if (route === "home") await renderHome(page);
  else if (
    ["library", "favorites", "downloads", "collection", "recent", "author-books", "series-books", "rating-books"].includes(
      route,
    )
  )
    renderLibrary(page, state?.limit);
  else if (["authors", "tags", "series", "ratings"].includes(route)) renderGroups(page);
  else if (route === "notebook") await renderNotebook(page);
  else if (route === "statistics") await renderStats(page);
  else if (route === "catalogs") renderCatalogs(page);
  else if (route === "files") await renderFiles(page);
  else if (route === "settings") await renderSettings(page);
  else if (route === "profile") await renderProfile(page, books, settings, reload);
  else if (route === "history") await renderHistory(page, books);
  if (page.isConnected) {
    // Restore before painting, with the previous batch size already in the DOM.
    page.scrollTop = state?.top ?? 0;
    if (previous !== key) enterPage(page, !state, previous?.startsWith("home:") ? 1 : -1);
  }
}
async function renderHome(page: HTMLElement) {
  const [sessions, marks, readingPick] = await Promise.all([db.sessions(), db.marks(), db.preference<string>("reading-pick")]);
  if (!page.isConnected) return;
  const rhythm = readingSummary(sessions);
  page.classList.add("home-page");
  const recent = books.filter(b => b.lastRead > 0).sort((a, b) => b.lastRead - a.lastRead);
  const current = recent.find(b => !b.finished) ?? sorted().find(b => !b.finished) ?? recent[0];
  const fresh = books.slice().sort((a, b) => b.added - a.added).slice(0, 8);
  const card = (b: Book) => `<article class="home-book"><button data-open="${b.id}" aria-label="Read ${E(b.title)}"><img src="${E(cover(b))}" alt="" loading="lazy" decoding="async"><strong>${E(b.title)}</strong><small>${E(b.author)}</small></button></article>`;
  const todayMinutes = Math.floor(rhythm.today / 60);
  const week = rhythm.week.map((day, index) => `<span class="week-day ${day.seconds >= 60 ? "has-reading" : ""} ${index === 6 ? "is-today" : ""}" aria-label="${E(day.date)}: ${Math.floor(day.seconds / 60)} minutes${index === 6 ? ", today" : ""}"><small>${E(day.label)}</small><i aria-hidden="true">${day.seconds >= 60 ? icon("check", 14) : '<span></span>'}</i></span>`).join("");
  page.innerHTML = `${current ? `<section class="continue-card"><div class="cover-stage"><div class="book-plinth" aria-hidden="true"></div><button class="home-book-details subtle" data-book-menu="${current.id}" aria-label="Details for ${E(current.title)}">${icon("info", 16)} Details</button><button class="continue-cover" data-open="${current.id}" aria-label="Read ${E(current.title)}"><img src="${E(cover(current))}" alt="${E(current.title)} cover"></button></div><div class="continue-copy"><h1>${E(current.title)}</h1><div class="continue-meta"><p>${E(current.author)}</p><span>${progress(current)}% read</span></div><div class="continue-progress" role="progressbar" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress(current)}"><span style="width:${progress(current)}%"></span></div><button class="primary" data-open="${current.id}">${current.lastRead ? "Continue reading" : "Start reading"}${icon("chevron", 19)}</button></div></section>` : `<section class="welcome-card"><div class="empty-book-scene" aria-hidden="true"><div class="empty-volume back-volume"></div><div class="empty-volume front-volume"><span>BOOKS</span>${icon("book", 44)}<i>A world<br>within reach.</i></div></div><h1>A place for<br>every story.</h1><p>Bring your books. Keep your place.<br>Read at your own pace.</p><button class="primary" data-action="import">Add your first book ${icon("plus", 20)}</button><button class="subtle" data-action="sample-books">Explore four free classics ${icon("chevron", 16)}</button></section>`}
  <button class="home-rhythm" data-shortcut="profile" aria-label="Your reading activity. ${todayMinutes} of ${settings.dailyGoal} minutes today"><span class="rhythm-heading"><strong>This week</strong><span>${todayMinutes >= settings.dailyGoal ? `${icon("check", 15)} Daily goal reached` : `${todayMinutes} / ${settings.dailyGoal} min today`}${icon("chevron",16)}</span></span><span class="reading-week">${week}</span></button>
  <section class="home-section home-reading-pick"></section>
  <section class="home-section home-margins"></section>
  ${fresh.length ? `<section class="home-section"><div class="home-section-heading"><h2>Your collection</h2><button class="subtle" data-shortcut="library">See all ${icon("chevron", 15)}</button></div><div class="home-book-rail">${fresh.map(card).join("")}</div></section>` : ""}
  <div class="home-quick-actions"><button data-action="app-themes"><i>${icon("palette",22)}</i><span><strong>Make it yours</strong><small>27 library themes</small></span>${icon("chevron",18)}</button><button data-action="download-book"><i>${icon("download",22)}</i><span><strong>Download books</strong><small>From a link or a catalog</small></span>${icon("chevron",18)}</button><button data-action="import"><i>${icon("plus", 22)}</i><span><strong>Add books</strong><small>From your device</small></span>${icon("chevron", 18)}</button><button data-shortcut="catalogs"><i>${icon("globe", 22)}</i><span><strong>Explore catalogs</strong><small>Find your next read</small></span>${icon("chevron", 18)}</button></div>`;
  mountMargins(page.querySelector<HTMLElement>(".home-margins")!, marks, books, cover, openSavedPassage);
  mountReadingPick(page.querySelector<HTMLElement>(".home-reading-pick")!, books, readingPick, cover);
}

async function openSavedPassage(mark: Mark) {
  await openBook(mark.bookId);
  await reader?.go(mark.location);
}

function title(
  _kicker: string,
  heading: string,
  description: string,
  actions = "",
) {
  return `<div class="page-heading"><div><h1>${heading}</h1><p>${description}</p></div>${actions}</div>`;
}
function renderLibrary(page: HTMLElement, limit = BOOK_BATCH) {
  page.classList.add("shelf-page");
  page.classList.toggle("wooden-shelf", settings.woody && settings.view === "grid" && route !== "recent");
  if (route === "recent") page.classList.add("recent-page");
  page.innerHTML = `${route === "downloads" ? `<button class="primary download-entry" data-action="download-book">${icon("download",18)} Download a book</button>` : ""}<div class="library-heading"><div><p class="library-total">${books.length} ${books.length === 1 ? "book" : "books"}</p></div><button class="primary" data-action="import">${icon("plus", 18)} Add books</button></div><div class="shelf-search"><label>${icon("search", 21)}<input id="library-search" type="search" value="${E(query)}" placeholder="Search title, author, or tag" aria-label="Search your library"></label><button class="appbar-button" data-action="close-search" aria-label="Clear search" ${query ? "" : "hidden"}>${icon("close", 21)}</button></div>
  <div class="library-filters" role="tablist" aria-label="Reading status">${[["all", "All books"], ["reading", "Reading"], ["unread", "Unread"], ["finished", "Finished"]].map(([id,label]) => `<button role="tab" data-filter="${id}" aria-selected="${id === filter}" class="${id === filter ? "active" : ""}">${label}</button>`).join("")}</div>
  <div class="library-tools"><button class="subtle" data-action="shelf-selector">${icon("library", 18)} Collections ${icon("down", 15)}</button><div><button class="icon-button" data-action="sort-books" aria-label="Sort books">${icon("sliders", 20)}</button><button class="icon-button" data-action="view-${settings.view === "grid" ? "list" : "grid"}" aria-label="${settings.view === "grid" ? "Switch to list view" : "Switch to cover view"}">${icon(settings.view === "grid" ? "list" : "grid", 20)}</button></div></div><p class="library-result-count" aria-live="polite"></p><div id="books-grid" class="books-${settings.view}" style="--shelf-columns:${settings.shelfColumns}"></div>`;
  renderBooks(limit);
  page.querySelector("#library-search")!.addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    page.querySelector<HTMLElement>('[data-action="close-search"]')!.hidden = !query;
    cancelAnimationFrame(searchFrame);
    searchFrame = requestAnimationFrame(() => { if (page.isConnected) renderBooks(); });
  });
}
function filteredBooks() {
  return sorted().filter(
    (b) =>
      (route !== "recent" || b.lastRead > 0) &&
      (route !== "favorites" || b.favorite) &&
      (route !== "downloads" || b.downloaded) &&
      (route !== "collection" || b.tags.includes(collection)) &&
      (route !== "author-books" || b.author === collection) &&
      (route !== "series-books" || b.series === collection) &&
      (route !== "rating-books" || b.rating === Number(collection)) &&
      (!query ||
        `${b.title} ${b.author} ${b.series ?? ""} ${b.filename} ${b.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "reading" && b.lastRead > 0 && !b.finished) ||
        (filter === "unread" && !b.lastRead) ||
        (filter === "finished" && b.finished)),
  ).sort((a, b) => route === "series-books" ? (a.seriesIndex ?? Infinity) - (b.seriesIndex ?? Infinity) || a.title.localeCompare(b.title) : 0);
}
function renderBooks(limit = BOOK_BATCH) {
  limit = Math.max(BOOK_BATCH, limit);
  cancelAnimationFrame(searchFrame);
  searchFrame = 0;
  const out = app.querySelector<HTMLElement>("#books-grid");
  if (!out) return;
  const list = filteredBooks(),
    layout = route === "recent" ? "list" : settings.view;
  out.className = "books-" + layout;
  const count = app.querySelector(".library-result-count");
  if (count) count.textContent = `${list.length} ${list.length === 1 ? "book" : "books"}${query ? " found" : ""}`;
  app.querySelectorAll<HTMLElement>("[data-filter]").forEach(b => {
    b.classList.toggle("active", b.dataset.filter === filter);
    b.setAttribute("aria-selected", String(b.dataset.filter === filter));
  });
  let selection = app.querySelector<HTMLElement>(".bulk-books");
  if (selectingBooks) {
    if (!selection) {
      selection = document.createElement("div");
      selection.className = "bulk-books";
      out.before(selection);
    }
    selection.innerHTML = `<span>${selectedBooks.size} selected</span>${[
      ["all", "Select all"],
      ["favorite", "Favorite"],
      ["tag", "Tags"],
      ["finished", "Finished"],
      ["remove", "Remove"],
      ["cancel", "Cancel"],
    ]
      .map(
        ([action, label]) => `<button data-bulk="${action}">${label}</button>`,
      )
      .join("")}`;
    selection
      .querySelectorAll<HTMLElement>("[data-bulk]")
      .forEach(
        (button) => (button.onclick = () => bulkBooks(button.dataset.bulk!)),
      );
  } else selection?.remove();
  libraryObserver?.disconnect();
  out.parentElement?.querySelector(".library-more")?.remove();
  out.replaceChildren();
  const card = (b: Book) => `<article class="book-card" data-book-id="${b.id}">${selectingBooks ? `<input class="book-select" type="checkbox" data-select-book="${b.id}" aria-label="Select ${E(b.title)}" ${selectedBooks.has(b.id) ? "checked" : ""}>` : ""}<div class="book-cover-wrap"><button class="book-cover-button" data-open="${b.id}" aria-label="Read ${E(b.title)}"><img class="book-cover" src="${E(cover(b))}" alt="${E(b.title)} cover" loading="lazy" decoding="async" width="280" height="420"></button>${b.favorite ? `<span class="favorite-indicator">${icon("heart", 14)}</span>` : ""}${b.finished ? `<span class="finished-badge">${icon("check", 13)}</span>` : ""}${settings.coverProgress && b.lastRead ? `<span class="cover-progress">${progress(b)}%</span>` : ""}${settings.coverRating && b.rating ? `<span class="cover-rating">${"★".repeat(b.rating) + "☆".repeat(5 - b.rating)}</span>` : ""}<button class="book-more icon-button" data-book-menu="${b.id}" aria-label="Options for ${E(b.title)}">${icon("more", 20)}</button></div><div class="book-info"><button class="book-title" data-open="${b.id}">${E(b.title)}</button><p class="book-author">${E(b.author)}</p><div class="book-bottom"><span class="book-format">${E(b.format.toUpperCase())}</span>${b.rating ? `<span class="book-rating">${icon("star", 13)} ${b.rating}</span>` : ""}<span class="book-reading-status">${b.finished ? "Finished" : b.lastRead ? progress(b) + "%" : "Unread"}</span></div>${b.lastRead && !b.finished ? `<div class="book-progress"><span style="width:${progress(b)}%"></span></div>` : ""}</div></article>`;
  let shown = 0;
  const append = (amount: number) => {
    const next = Math.min(list.length, shown + amount);
    out.insertAdjacentHTML("beforeend", list.slice(shown, next).map(card).join(""));
    shown = next;
    out.dataset.limit = String(shown);
  };
  append(limit);
  out.onchange = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.selectBook) return;
    input.checked ? selectedBooks.add(input.dataset.selectBook) : selectedBooks.delete(input.dataset.selectBook);
    const count = app.querySelector(".bulk-books > span");
    if (count) count.textContent = `${selectedBooks.size} selected`;
  };
  if (shown < list.length) {
    const more = document.createElement("button");
    more.className = "library-more secondary";
    const update = () => { more.textContent = `Show more books · ${shown} of ${list.length}`; };
    update(); out.after(more);
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && out.isConnected) loadMore();
    }, { root: app.querySelector("#page"), rootMargin: "0px 0px 500px 0px" });
    const loadMore = () => {
      if (!out.isConnected) return;
      append(BOOK_BATCH); update();
      if (shown >= list.length) { observer.disconnect(); more.remove(); }
    };
    more.onclick = () => {
      const next = shown;
      loadMore();
      out.querySelectorAll<HTMLButtonElement>(".book-cover-button")[next]?.focus({ preventScroll: true });
    };
    libraryObserver = observer;
    observer.observe(more);
  }
  if (!list.length)
    out.innerHTML = `<div class="empty-state">${icon(route === "recent" ? "clock" : "book", 42)}<h3>${query ? "No books found" : route === "recent" ? "Recent list" : route === "favorites" ? "No favorites" : "Your shelf is ready"}</h3><p>${query ? "Try a different title, author, or tag." : route === "recent" ? "Books you open will appear here." : "Add a book from your device to start your library."}</p><button class="primary" data-action="import">Import Books</button>${!books.length ? '<button class="subtle" data-action="sample-books">Import sample books</button>' : ""}</div>`;
}
async function bulkBooks(action: string) {
  try {
    if (action === "cancel") {
      selectingBooks = false;
      selectedBooks.clear();
      renderBooks();
      return;
    }
    if (action === "all") {
      for (const book of filteredBooks()) selectedBooks.add(book.id);
      renderBooks();
      return;
    }
    const chosen = books.filter((b) => selectedBooks.has(b.id));
    if (!chosen.length) {
      toast("Select books first.");
      return;
    }
    if (action === "remove") {
      if (
        !(await confirmDialog(
          "Remove selected books?",
          `Remove ${chosen.length} books and their notes from the library?`,
          "Remove",
        ))
      )
        return;
      for (const book of chosen) await db.removeBook(book.id);
    } else {
      const tags =
        action === "tag"
          ? await inputDialog("Tags", "Comma-separated tags")
          : null;
      if (action === "tag" && tags === null) return;
      for (const book of chosen) {
        if (action === "favorite") book.favorite = true;
        if (action === "finished") {
          book.finished = true;
          book.progress = 1;
        }
        if (tags)
          book.tags = [
            ...new Set([
              ...book.tags,
              ...tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            ]),
          ];
        await db.putBook(book);
      }
    }
    selectingBooks = false;
    selectedBooks.clear();
    await reload();
  } catch (e) {
    toast((e as Error).message, true);
  }
}
function renderGroups(page: HTMLElement) {
  const kind = route;
  const values = (b: Book) => kind === "authors" ? [b.author] : kind === "series" ? [b.series || ""] : kind === "ratings" ? [String(b.rating)] : b.tags;
  const groups = [...new Set(books.flatMap(values).filter(Boolean))].sort((a, b) => kind === "ratings" ? Number(b) - Number(a) : a.localeCompare(b));
  const attribute = kind === "authors" ? "author" : kind === "series" ? "series" : kind === "ratings" ? "rating-group" : "collection";
  page.innerHTML = `${title("YOUR COLLECTIONS", E(shelfTitle()), "Find your books by author, series, rating, or tag.", `<button class="secondary" data-action="shelf-selector">${icon("library", 18)} Collections</button>`)}<div class="group-list">${groups.map(group => `<button class="group-row" data-${attribute}="${E(group)}">${icon(kind === "ratings" ? "star" : kind === "tags" ? "bookmark" : "book", 25)}<span>${E(kind === "ratings" ? Number(group) ? "★".repeat(Number(group)) : "Unrated" : group)}</span><small>${books.filter(book => values(book).includes(group)).length}</small>${icon("chevron", 19)}</button>`).join("") || '<p class="empty-small">No items</p>'}</div>`;
}
function shelfSelector() {
  const m = modal(
    "Collections",
    `<div class="native-choice-list">${[
      ["library", "All Books"],
      ["favorites", "My Favorites"],
      ["downloads", "Downloads"],
      ["authors", "Authors"],
      ["series", "Series"],
      ["ratings", "My ratings"],
      ["tags", "Tags"],
      ["notebook", "Bookmarks"],
    ]
      .map(
        ([id, label]) =>
          `<button data-destination="${id}"><span class="radio-circle ${route === id ? "checked" : ""}"></span><span>${label}</span></button>`,
      )
      .join("")}</div>`,
  );
  m.querySelectorAll<HTMLElement>("[data-destination]").forEach(
    (b) =>
      (b.onclick = () => {
        route = b.dataset.destination!;
        filter = "all";
        query = "";
        closeModal();
        render();
      }),
  );
}
function shelfFilter() {
  const m = modal(
    "Filter",
    `<div class="native-choice-list">${[
      ["all", "All Books"],
      ["reading", "Reading"],
      ["unread", "Unread"],
      ["finished", "Finished"],
    ]
      .map(
        ([id, label]) =>
          `<button data-status="${id}"><span class="radio-circle ${filter === id ? "checked" : ""}"></span><span>${label}</span></button>`,
      )
      .join("")}</div>`,
  );
  m.querySelectorAll<HTMLElement>("[data-status]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.status!;
        closeModal();
        renderBooks();
      }),
  );
}
function appMenu() {
  const m = modal(
    "Books",
    `<div class="option-buttons">${[
      ["import", "Import Books"],
      ["select-books", "Select books"],
      ["shelf-options", "Library appearance"],
      ["sort-books", "Sort by"],
      [
        settings.view === "grid" ? "view-list" : "view-grid",
        settings.view === "grid" ? "List view" : "Cover view",
      ],
      ["add-collection", "Add to Favorites / Tag"],
      ["notebook", "Bookmarks"],
      ["backup", "Backup"],
      ["restore", "Restore"],
      ["sample-books", "Import sample books"],
    ]
      .map(
        ([id, label]) =>
          `<button class="option-row" data-menu-action="${id}"><span>${label}</span></button>`,
      )
      .join("")}</div>`,
  );
  m.classList.add("overflow-menu");
  m.querySelectorAll<HTMLElement>("[data-menu-action]").forEach(
    (b) =>
      (b.onclick = () => {
        const action = b.dataset.menuAction!;
        closeModal();
        if (action === "notebook") {
          route = "notebook";
          render();
        } else actions(action).catch((e) => toast(e.message, true));
      }),
  );
}
function shelfOptions() {
  const m = modal(
    "Library appearance",
    `${toggle("woody", "Warm shelf background", settings.woody)}${toggle("coverProgress", "Show reading progress on book cover", settings.coverProgress)}${toggle("coverRating", "Show my rating on book cover", settings.coverRating)}${range("shelfColumns", "Books per row", settings.shelfColumns, 2, 6, 1)}${select("appTheme", "Color", settings.appTheme, Object.fromEntries(Object.entries(appThemes).map(([id,t])=>[id,t.name])))}<div class="dialog-actions"><button class="secondary" id="shelf-import">Import Books</button><button class="primary close-options">OK</button></div>`,
  );
  m.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "[data-setting]",
  ).forEach((input) =>
    input.addEventListener("input", async () => {
      const key = input.dataset.setting!;
      (settings as any)[key] =
        input instanceof HTMLInputElement && input.type === "checkbox"
          ? input.checked
          : typeof (settings as any)[key] === "number"
            ? Number(input.value)
            : input.value;
      await db.saveSettings(settings);
      await render();
    }),
  );
  m.querySelector(".close-options")!.addEventListener("click", closeModal);
  m.querySelector("#shelf-import")!.addEventListener("click", () => {
    closeModal();
    actions("import");
  });
}
async function importFiles(files: File[], open = false) {
  if (importing) {
    toast("Another import is still running.");
    return;
  }
  importing = true;
  if (["recent", "home", "settings", "notebook", "statistics"].includes(route)) route = "library";
  let added = 0,
    last: Book | undefined;
  const errors: string[] = [];
  try {
    let expanded: File[] = [];
    for (const file of files) {
      if (["zip", "rar"].includes(ext(file.name))) {
        const entries = await expandArchive(file);
        if (entries.length) expanded.push(...entries);
        else expanded.push(file);
      } else expanded.push(file);
    }
    for (let i = 0; i < expanded.length; i++) {
      const file = expanded[i];
      toast(`Importing ${i + 1} of ${expanded.length} · ${file.name}`);
      try {
        const b = await createBook(file);
        if (books.some((x) => x.id === b.id)) {
          last = books.find((x) => x.id === b.id);
          if (last && (b.sourceUri || b.downloaded)) {
            if (b.sourceUri) last.sourceUri = b.sourceUri;
            if (b.downloaded) last.downloaded = true;
            await db.putBook(last);
          }
          continue;
        }
        if (route === "collection") b.tags = [collection];
        await db.putBook(b);
        books.push(b);
        last = b;
        added++;
      } catch (e) {
        errors.push(file.name + ": " + (e as Error).message);
      }
    }
    await reload();
    if (errors.length) {
      const m = modal(
        "Import results",
        `<p>${added} book${added === 1 ? "" : "s"} added.</p><ul class="import-errors">${errors.map((e) => `<li>${E(e)}</li>`).join("")}</ul><p class="muted">Encrypted Kindle and EPUB DRM are not supported. CHM decoding requires Android.</p>`,
      );
    } else
      toast(
        added
          ? `${added} book${added === 1 ? "" : "s"} added to your library.`
          : "These books are already in your library.",
      );
    if (open && last && !errors.length) await openBook(last.id);
  } finally {
    importing = false;
  }
}
let bookOpenQueue = Promise.resolve();
let bookOpenRequest = 0;
function openBook(id: string) {
  const request = ++bookOpenRequest;
  const opening = bookOpenQueue
    .catch(() => {})
    .then(async () => {
      if (request === bookOpenRequest) await openBookNow(id);
    });
  bookOpenQueue = opening;
  return opening;
}
async function openBookNow(id: string) {
  rememberPage();
  if (reader) await reader.close();
  const b = await db.book(id);
  if (!b) return toast("This book is no longer in the library.", true);
  reader = new Reader(b, await db.settings(), () => {
    reader = null;
    reload();
    setTimeout(() => { if (!reader) maybeAutoBackup().catch(error => toast(error.message, true)); }, 500);
  });
  try {
    await reader.open();
  } catch (e) {
    reader = null;
    toast((e as Error).message, true);
  }
}
async function reload() {
  books = await db.books();
  settings = await db.settings();
  await render();
  if (isNative())
    native("widget", {
      books: sorted()
        .slice(0, 60)
        .map((b) => ({
          id: b.id,
          title: b.title,
          percent: progress(b),
          cover: b.cover,
          favorite: b.favorite,
          tags: b.tags,
          lastRead: b.lastRead,
          added: b.added,
        })),
    }).catch(() => {});
}
async function bookMenu(id: string) {
  const b = books.find((b) => b.id === id);
  if (!b) return;
  const m = modal(
    "Book details",
    `<div class="book-portrait"><div class="portrait-jacket"><img src="${E(cover(b))}" width="128" height="192" alt="${E(b.title)} cover"></div><div class="portrait-copy"><h3>${E(b.title)}</h3><p>${E(b.author)}</p>${b.series ? `<p class="portrait-series">${E(b.series)}${b.seriesIndex ? ` · ${b.seriesIndex}` : ""}</p>` : ""}<div class="portrait-meta"><span>${E(b.format.toUpperCase())}</span><button class="icon-button portrait-favorite" data-book-action="favorite" aria-pressed="${b.favorite}" aria-label="${b.favorite ? "Remove from favorites" : "Add to favorites"}">${icon("heart",22)}</button></div></div></div>
    <section class="book-journey" aria-label="Your reading progress"><div><span>${b.finished ? "Finished" : b.lastRead ? "Your place" : "Ready when you are"}</span><strong>${progress(b)}% read</strong></div><progress max="100" value="${progress(b)}" aria-label="Book reading progress"></progress><div class="journey-facts"><span>${icon("clock",16)} <span data-reading-time>${minutes(b.seconds)} min reading</span></span><button class="subtle" data-book-notes>${icon("notebook",16)} <span data-saved-count>Saved items</span>${icon("chevron",14)}</button></div></section>
    <div class="portrait-rating"><span>Your rating</span><div class="rating-picker" role="group" aria-label="Book rating">${[1,2,3,4,5].map(n=>`<button data-rating="${n}" class="${n<=b.rating?'rated':''}" aria-pressed="${n===b.rating}" aria-label="Rate ${n} stars${n===b.rating?', tap to clear':''}">${icon("star",21)}</button>`).join("")}</div></div>
    <section class="portrait-passages" aria-label="Saved passages"><h3>Saved passages</h3><p class="portrait-empty" role="status">Loading your saved words…</p></section>
    <details class="portrait-manage"><summary>Manage book ${icon("down",18)}</summary><p class="portrait-file">${(b.size/1048576).toFixed(2)} MB · Added ${new Date(b.added).toLocaleDateString()}</p><div class="option-buttons">${[
      ["finished", "finished", b.finished ? "Mark as unread" : "Mark as finished"],
      ["edit", "pencil", "Edit title, author & collections"],
      ["cover", "palette", "Change book cover"],
      ["download", "download", "Save book file"],
      ["remove", "trash", "Remove from this library"],
    ].map(([action,ic,label])=>`<button class="option-row" data-book-action="${action}">${icon(ic)}<span>${label}</span>${icon("chevron",16)}</button>`).join("")}</div></details>`,
    { footer: `<button class="primary portrait-read" data-book-action="read">${icon("book",19)} ${b.lastRead ? "Continue reading" : "Start reading"}${icon("arrow",18)}</button>` },
  );
  m.classList.add("book-portrait-sheet");
  let changed = false;
  m.addEventListener("modalclose", () => { if (changed) void render(); }, { once: true });
  m.querySelector<HTMLButtonElement>("[data-book-notes]")!.onclick = async () => {
    filterJournalByBook(id); closeModal(); route = "notebook"; await render();
  };
  void Promise.all([db.marks(id), db.sessions()]).then(([marks, sessions]) => {
    if (!m.isConnected) return;
    const seconds = sessions.filter(s=>s.bookId === id).reduce((sum,s)=>sum+s.seconds,0);
    m.querySelector("[data-reading-time]")!.textContent = `${minutes(seconds)} min reading`;
    m.querySelector("[data-saved-count]")!.textContent = `${marks.length} saved ${marks.length===1?"item":"items"}`;
    const recent = marks.filter(mark=>mark.quote.trim()).sort((a,b)=>b.created-a.created).slice(0,2);
    const section = m.querySelector(".portrait-passages")!;
    section.innerHTML = `<h3>Saved passages</h3>${recent.length ? recent.map(mark=>`<button class="portrait-passage" data-portrait-mark="${E(mark.id)}">${passage(mark,true)}<span>Open passage ${icon("arrow",16)}</span></button>`).join("") : '<p class="portrait-empty">Highlight a passage while reading. Your words will be waiting here.</p>'}`;
    section.querySelectorAll<HTMLButtonElement>("[data-portrait-mark]").forEach(button => button.onclick = () => {
      const mark = recent.find(mark=>mark.id===button.dataset.portraitMark)!;
      closeModal(); void openSavedPassage(mark).catch(error=>toast(error.message,true));
    });
  }).catch(()=>{ if (m.isConnected) m.querySelector(".portrait-passages")!.innerHTML='<p class="portrait-empty">Saved passages could not be loaded. Reopen book details to retry.</p>'; });
  m.querySelectorAll<HTMLElement>("[data-rating]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      b.rating = b.rating === Number(btn.dataset.rating) ? 0 : Number(btn.dataset.rating);
      changed = true;
      await db.putBook(b);
      m.querySelectorAll<HTMLElement>("[data-rating]").forEach((x) => {
        x.classList.toggle("rated", Number(x.dataset.rating) <= b.rating);
        x.setAttribute("aria-pressed", String(Number(x.dataset.rating) === b.rating));
        x.setAttribute("aria-label", `Rate ${x.dataset.rating} stars${Number(x.dataset.rating) === b.rating ? ", tap to clear" : ""}`);
      });
    }),
  );
  m.querySelectorAll<HTMLElement>("[data-book-action]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        switch (btn.dataset.bookAction) {
          case "read":
            closeModal();
            await openBook(id);
            return;
          case "favorite":
            b.favorite = !b.favorite;
            await db.putBook(b);
            changed = true;
            btn.setAttribute("aria-pressed", String(b.favorite));
            btn.setAttribute("aria-label", b.favorite ? "Remove from favorites" : "Add to favorites");
            toast(b.favorite ? "Added to favorites." : "Removed from favorites.");
            break;
          case "finished":
            b.finished = !b.finished;
            if (b.finished) {
              b.progress = 1;
              b.lastRead = Date.now();
            } else {
              b.progress = 0;
              b.location = 0;
              b.lastRead = 0;
            }
            await db.putBook(b);
            closeModal();
            await reload();
            break;
          case "edit":
            editBook(b);
            break;
          case "cover": {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;
              if (file.size > 4 * 1024 * 1024)
                return toast("Choose a cover under 4 MB.", true);
              const fr = new FileReader();
              fr.onload = async () => {
                b.cover = String(fr.result);
                await db.putBook(b);
                closeModal();
                await reload();
              };
              fr.readAsDataURL(file);
            };
            input.click();
            break;
          }
          case "download":
            await saveFile(b.filename, b.blob);
            toast("Book exported.");
            break;
          case "remove":
            if (
              await confirmDialog(
                "Remove this book?",
                `Remove “${b.title}” and its notes from Books? The original file on your device will stay in place.`,
                "Remove book",
              )
            ) {
              await db.removeBook(b.id);
              await reload();
              toast("Book removed from the library.");
            }
            break;
        }
      } catch (e) {
        toast((e as Error).message, true);
      }
    }),
  );
}
function editBook(b: Book) {
  const m = modal(
    "A place on your shelf",
    `<form id="edit-book"><label class="field">Title<input name="title" required value="${E(b.title)}"></label><label class="field">Author<input name="author" value="${E(b.author)}"></label><label class="field">Series<input name="series" value="${E(b.series ?? "")}"></label><label class="field">Number in series<input name="seriesIndex" type="number" step="any" min="0" value="${b.seriesIndex ?? ""}"></label><label class="field">Collections & tags<input name="tags" value="${E(b.tags.join(", "))}" placeholder="Classics, To read, Favorites"><small>Separate collections with commas. A book can belong to more than one.</small></label><div class="dialog-actions"><button class="primary">Save changes ${icon("check", 16)}</button></div></form>`,
  );
  m.querySelector("form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target as HTMLFormElement);
    b.title = String(data.get("title")).trim();
    b.author = String(data.get("author")).trim() || "Unknown author";
    b.series = String(data.get("series") ?? "").trim();
    const index = String(data.get("seriesIndex") ?? "").trim();
    b.seriesIndex = index && Number.isFinite(Number(index)) ? Number(index) : undefined;
    b.tags = [
      ...new Set(
        String(data.get("tags"))
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ];
    await db.putBook(b);
    closeModal();
    await reload();
    toast("Book details updated.");
  });
}
async function renderNotebook(page: HTMLElement) {
  await renderJournal(page, books, cover, openSavedPassage);
}

async function renderStats(page: HTMLElement) {
  const sessions = await db.sessions();
  const total = sessions.reduce((a, s) => a + s.seconds, 0),
    today = sessions
      .filter((s) => s.date === dateKey())
      .reduce((a, s) => a + s.seconds, 0),
    finished = books.filter((b) => b.finished).length;
  const dates = [
    ...new Set(sessions.filter((s) => s.seconds >= 60).map((s) => s.date)),
  ];
  let streak = 0;
  const check = new Date();
  if (!dates.includes(dateKey())) check.setDate(check.getDate() - 1);
  while (dates.includes(check.toLocaleDateString("en-CA"))) {
    streak++;
    check.setDate(check.getDate() - 1);
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return {
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      date: d.toLocaleDateString("en-CA"),
      seconds: sessions
        .filter((s) => s.date === d.toLocaleDateString("en-CA"))
        .reduce((a, s) => a + s.seconds, 0),
    };
  });
  const max = Math.max(settings.dailyGoal * 60, ...week.map((d) => d.seconds));
  page.innerHTML =
    title(
      "A LITTLE EVERY DAY",
      "Your reading habits",
      "Small reading rituals add up to wonderful things.",
    ) +
    `<div class="stats-cards">${[
      [
        "clock",
        Math.floor(total / 3600) + "h " + minutes(total % 3600) + "m",
        "Time well spent",
      ],
      ["finished", String(finished), "Books finished"],
      ["flame", streak + " days", "Current reading streak"],
      [
        "target",
        minutes(today) + " / " + settings.dailyGoal + "m",
        "Today’s reading goal",
      ],
    ]
      .map(
        ([ic, value, label]) =>
          `<article class="stat-card"><span class="stat-icon">${icon(ic, 22)}</span><strong>${value}</strong><span>${label}</span></article>`,
      )
      .join(
        "",
      )}</div><div class="stats-panels"><section class="panel"><div class="section-heading"><div><h2>Reading this week</h2><p class="muted">Reading time · minutes</p></div><span class="chip">Last 7 days</span></div><div class="reading-chart" role="img" aria-label="Reading minutes for the last seven days: ${week.map((d) => d.day + " " + minutes(d.seconds)).join(", ")}">${week.map((d, i) => `<div class="chart-column ${i === 6 ? "today" : ""}"><span>${minutes(d.seconds)}m</span><div class="chart-track"><div class="chart-bar" style="height:${Math.max(1, (d.seconds / max) * 100)}%"></div></div><small>${d.day}</small></div>`).join("")}</div></section><section class="panel goal-panel"><span class="goal-flower">${icon("sun", 37)}</span><h2>Make a little space.</h2><p>A few quiet minutes.<br>A whole new perspective.</p><div class="goal-ring" style="--goal:${Math.min(100, (today / (settings.dailyGoal * 60)) * 100)}%"><span><strong>${minutes(today)}</strong><small>of ${settings.dailyGoal} minutes</small></span></div><button class="subtle" data-action="daily-goal">Change daily goal ${icon("arrow", 15)}</button></section></div><section class="panel stats-book-panel"><h2>Between the covers</h2>${
      books
        .filter((b) => b.seconds > 0)
        .sort((a, b) => b.seconds - a.seconds)
        .map((b) => {
          const ss = sessions.filter((s) => s.bookId === b.id),
            seconds = ss.reduce((a, s) => a + s.seconds, 0),
            words = ss.reduce((a, s) => a + s.words, 0);
          return `<button class="stats-book" data-open="${b.id}"><img src="${E(cover(b))}" alt=""><div><strong>${E(b.title)}</strong><small>${E(b.author)}</small></div><span>${minutes(seconds)} min</span><span>${seconds >= 60 ? Math.round(words / (seconds / 60)) : "—"} <small>estimated wpm</small></span><span>${progress(b)}%</span></button>`;
        })
        .join("") ||
      '<p class="empty-small">Reading activity appears here after you open a book.</p>'
    }<p class="small muted">Reading time counts while Books is visible and you are active. Speed is an estimate from newly visited text; rereading, illustrations, and skimmed pages affect it.</p></section>`;
}
function renderCatalogs(page: HTMLElement) {
  page.innerHTML =
    title(
      "SO MANY STORIES, SO LITTLE TIME",
      "Discover",
      "Discover public-domain books or connect your own Calibre library.",
      `<button class="primary" data-action="add-catalog">${icon("plus", 17)} Add catalog</button>`,
    ) +
    `<div class="catalog-grid">${settings.catalogs.map((c, i) => `<article class="catalog-card"><div class="catalog-symbol">${icon(i % 2 ? "library" : "globe", 33)}</div><span class="eyebrow">OPDS LIBRARY</span><h2>${E(c.name)}</h2><p>${E(c.url)}</p><div><button class="secondary" data-catalog="${E(c.id)}">Browse library ${icon("arrow", 16)}</button><button class="icon-button" data-remove-catalog="${E(c.id)}" aria-label="Remove ${E(c.name)}">${icon("trash", 17)}</button></div></article>`).join("")}</div><div class="info-banner">${icon("info", 20)}<div><strong>Your own library, anywhere.</strong><p>Start your Calibre content server and add its OPDS address, such as http://192.168.1.10:8080/opds. Android supports catalogs on your local network.</p></div></div>`;
  page.querySelectorAll<HTMLElement>("[data-remove-catalog]").forEach(
    (b) =>
      (b.onclick = async () => {
        settings.catalogs = settings.catalogs.filter(
          (c) => c.id !== b.dataset.removeCatalog,
        );
        await db.saveSettings(settings);
        render();
      }),
  );
}
const catalogAuth = new Map<string, { username: string; password: string }>();
async function catalogRequest(url: string) {
  const origin = new URL(url).origin;
  const auth =
    catalogAuth.get(origin) ??
    (isNative() ? await native("getCatalogAuth", { origin }) : null);
  return network(url, {
    headers: {
      Accept: "application/atom+xml,application/opds+json,application/json",
      ...(auth
        ? {
            Authorization:
              "Basic " +
              btoa(
                unescape(
                  encodeURIComponent(auth.username + ":" + auth.password),
                ),
              ),
          }
        : {}),
    },
  });
}
async function catalogLogin(url: string) {
  return new Promise<boolean>((resolve) => {
    const origin = new URL(url).origin;
    const m = modal(
      "Library sign-in",
      `<form id="catalog-login"><label class="field">Username<input name="username" autocomplete="username" required></label><label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label><p class="small">${E(origin)}</p><div class="dialog-actions"><button class="primary">Sign in</button></div></form>`,
    );
    m.addEventListener("modalclose", () => resolve(false), { once: true });
    m.querySelector("form")!.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(event.target as HTMLFormElement),
        auth = {
          username: String(form.get("username")),
          password: String(form.get("password")),
        };
      catalogAuth.set(origin, auth);
      if (isNative()) await native("setCatalogAuth", { origin, ...auth });
      resolve(true);
      closeModal();
    };
  });
}
async function browseCatalog(url: string) {
  const m = modal(
    "Online library",
    '<div class="loading-inline"><span class="spinner"></span>Opening catalog…</div>',
    { wide: true, subtitle: url },
  );
  try {
    const response = await catalogRequest(url);
    if (response.status === 401) {
      if (await catalogLogin(url)) return browseCatalog(url);
      return;
    }
    if (!response.ok)
      throw Error(
        "The catalog returned HTTP " +
          response.status +
          ". Check the address and connection.",
      );
    const source = await response.text();
    let entries: {
      title: string;
      author: string;
      href: string;
      download: boolean;
      type: string;
    }[] = [];
    let next = "",
      searchLink = "",
      searchType = "";
    if (source.trim().startsWith("{")) {
      const feed = JSON.parse(source);
      const publications = [
        ...(feed.publications ?? []),
        ...(feed.navigation ?? []),
        ...(feed.groups ?? []).flatMap((group: any) => [
          ...(group.publications ?? []),
          ...(group.navigation ?? []),
        ]),
      ];
      entries = publications.map((p: any) => {
        const links = p.links ?? (p.href ? [p] : []);
        const l =
          links.find((l: any) => String(l.rel).includes("acquisition")) ??
          links.find((l: any) => /epub|pdf|mobi/.test(l.type)) ??
          links[0];
        return {
          title: p.metadata?.title ?? p.title,
          author: [p.metadata?.author ?? p.metadata?.authors ?? []]
            .flat()
            .map((a: any) => (typeof a === "string" ? a : (a.name ?? "")))
            .join(", "),
          href: l ? new URL(l.href, url).href : "",
          download: /epub|pdf|mobi/.test(l?.type ?? ""),
          type: l?.type ?? "",
        };
      });
      next = feed.links?.find((l: any) => l.rel === "next")?.href ?? "";
      const search = feed.links?.find((l: any) => l.rel === "search");
      searchLink = search?.href ?? "";
      searchType = search?.type ?? "";
    } else {
      const doc = new DOMParser().parseFromString(source, "text/xml");
      if (doc.querySelector("parsererror"))
        throw Error("This address did not return a valid OPDS feed.");
      entries = Array.from(doc.getElementsByTagNameNS("*", "entry"))
        .map((entry) => {
          const links = Array.from(entry.getElementsByTagNameNS("*", "link"));
          const l =
            links.find(
              (l) =>
                l.getAttribute("rel")?.includes("acquisition") &&
                /epub|pdf|mobi/.test(l.getAttribute("type") ?? ""),
            ) ??
            links.find((l) =>
              /epub|pdf|mobi/.test(l.getAttribute("type") ?? ""),
            ) ??
            links.find((l) => /atom|opds/.test(l.getAttribute("type") ?? ""));
          return {
            title:
              entry.getElementsByTagNameNS("*", "title")[0]?.textContent ??
              "Untitled",
            author:
              entry.getElementsByTagNameNS("*", "name")[0]?.textContent ?? "",
            href: l ? new URL(l.getAttribute("href")!, url).href : "",
            download: /epub|pdf|mobi/.test(l?.getAttribute("type") ?? ""),
            type: l?.getAttribute("type") ?? "",
          };
        })
        .filter((e) => e.href);
      const search = Array.from(doc.documentElement.children).find(
        (el) => el.localName === "link" && el.getAttribute("rel") === "search",
      );
      searchLink = search?.getAttribute("href") ?? "";
      searchType = search?.getAttribute("type") ?? "";
      next =
        Array.from(doc.documentElement.children)
          .find(
            (e) => e.localName === "link" && e.getAttribute("rel") === "next",
          )
          ?.getAttribute("href") ?? "";
    }
    m.querySelector(".modal-body")!.innerHTML =
      `${searchLink ? '<form id="catalog-search" class="inline-form"><input type="search" name="query" placeholder="Search" aria-label="Search catalog" required><button class="primary">Search</button></form>' : ""}<div class="catalog-entries">${entries.map((entry, i) => `<button class="catalog-entry" data-entry="${i}"><span class="catalog-entry-icon">${icon(entry.download ? "book" : "folder", 22)}</span><div><strong>${E(entry.title)}</strong><small>${E(entry.author || "Browse collection")}</small></div>${icon(entry.download ? "download" : "chevron", 18)}</button>`).join("") || '<p class="empty-small">No readable entries found in this catalog.</p>'}</div>${next ? '<button class="secondary" id="catalog-next">Next page ' + icon("arrow", 16) + "</button>" : ""}`;
    m
      .querySelector<HTMLFormElement>("#catalog-search")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          let template = new URL(searchLink, url).href
            .replace(/%7B/gi, "{")
            .replace(/%7D/gi, "}");
          if (searchType.includes("opensearchdescription")) {
            const response = await catalogRequest(template),
              doc = new DOMParser().parseFromString(
                await response.text(),
                "application/xml",
              );
            template =
              doc
                .getElementsByTagNameNS("*", "Url")[0]
                ?.getAttribute("template") ?? "";
          }
          if (!template) throw Error("The catalog has no search template.");
          const query = String(
            new FormData(event.target as HTMLFormElement).get("query"),
          );
          const target = template
            .replace(/\{searchTerms\??\}/g, encodeURIComponent(query))
            .replace(/\{[^}]+\}/g, "");
          await browseCatalog(new URL(target, url).href);
        } catch (error) {
          toast((error as Error).message, true);
        }
      });
    m.querySelectorAll<HTMLElement>("[data-entry]").forEach(
      (b) =>
        (b.onclick = async () => {
          const entry = entries[Number(b.dataset.entry)];
          if (!entry.download) return browseCatalog(entry.href);
          b.setAttribute("disabled", "");
          try {
            toast("Downloading " + entry.title + "…");
            const res = await catalogRequest(entry.href);
            if (!res.ok) throw Error("Download failed (" + res.status + ").");
            const extension = entry.type.includes("pdf")
              ? "pdf"
              : entry.type.includes("mobi")
                ? "mobi"
                : "epub";
            const file = new File(
              [await res.blob()],
              entry.title.replace(/[^\p{L}\p{N} ._-]/gu, "") + "." + extension,
            );
            closeModal();
            Object.assign(file, { downloaded: true });
            route = "downloads";
            await importFiles([file]);
          } catch (e) {
            toast((e as Error).message, true);
          } finally {
            b.removeAttribute("disabled");
          }
        }),
    );
    m
      .querySelector("#catalog-next")
      ?.addEventListener("click", () => browseCatalog(new URL(next, url).href));
  } catch (e) {
    m.querySelector(".modal-body")!.innerHTML =
      `<div class="empty-state">${icon("offline", 35)}<h3>Couldn’t open this library.</h3><p>${E((e as Error).message)}</p>${!isNative() ? '<p class="small muted">Some catalogs block browser requests. Use the Android app for those catalogs.</p>' : ""}</div>`;
  }
}
async function renderFiles(page: HTMLElement) {
  if (isNative() && !directoryStack.length) {
    const selected = await native("getFolder");
    if (selected) directoryStack = [selected];
  }
  page.innerHTML = `<div class="files-toolbar"><button class="secondary" id="folder-back" ${directoryStack.length < 2 ? "disabled" : ""}>${icon("back", 19)}</button><span class="files-path">${directoryStack.length ? E(decodeURIComponent(directoryStack.at(-1)!.split("/").pop() ?? "Device folder")) : "My Files"}</span><button class="appbar-button" id="folder-menu" aria-label="Folder operations">${icon("more", 22)}</button></div><div class="settings-actions"><button class="secondary" data-action="ftp">FTP / FTPS</button></div><div id="file-entries"></div>`;
  page.querySelector("#folder-back")!.addEventListener("click", () => {
    directoryStack.pop();
    render();
  });
  page.querySelector("#folder-menu")!.addEventListener("click", () => {
    const m = modal(
      "My Files",
      `<div class="option-buttons">${[["choose", "Choose a folder"], ["create", "New folder"], ["import", "Import a file"], ["scan", "Import books in this folder"], ...(fileClipboard ? [["paste", `Paste ${fileClipboard.name}`]] : [])].map(([id, label]) => `<button class="option-row" data-folder-op="${id}"><span>${E(label)}</span></button>`).join("")}</div>`,
    );
    m.classList.add("overflow-menu");
    m.querySelectorAll<HTMLElement>("[data-folder-op]").forEach(
      (button) =>
        (button.onclick = async () => {
          const op = button.dataset.folderOp;
          closeModal();
          try {
            if (op === "choose") {
              directoryStack = [await native("pickTree")];
              await render();
            } else if (op === "import") actions("import");
            else if (op === "create") {
              if (!directoryStack.length) throw Error("Choose a folder first.");
              const name = await inputDialog("New folder", "Folder name");
              if (name) {
                await native("makeFolder", {
                  uri: directoryStack.at(-1),
                  name,
                });
                await render();
              }
            } else if (op === "paste" && fileClipboard) {
              if (!directoryStack.length)
                throw Error("Choose a destination folder.");
              toast("Copying files…");
              await native(fileClipboard.move ? "moveFile" : "copyFile", {
                uri: fileClipboard.uri,
                parent: fileClipboard.parent,
                destination: directoryStack.at(-1),
              });
              fileClipboard = null;
              await render();
              toast("Files saved.");
            } else if (op === "scan") {
              if (!directoryStack.length) throw Error("Choose a folder first.");
              const list = await native("listFiles", {
                uri: directoryStack.at(-1),
              });
              const files: File[] = [];
              for (const f of list) {
                if (!f.directory && supported.includes(ext(f.name))) {
                  const staged = await native("openFile", { uri: f.uri });
                  const r = await fetch(staged.url);
                  files.push(new File([await r.blob()], staged.name));
                }
              }
              if (files.length) {
                await importFiles(files);
                toast(files.length + " book files scanned.");
              } else toast("No supported book files in this folder.");
            }
          } catch (e) {
            toast((e as Error).message, true);
          }
        }),
    );
  });
  const out = page.querySelector("#file-entries")!;
  if (!isNative() || !directoryStack.length) {
    out.innerHTML = `<div class="empty-state">${icon("folder", 40)}<h3>My Files</h3><p>Select a device folder to browse and manage files.</p><button class="primary" data-action="pick-folder">Choose a folder</button><button class="subtle" data-action="import">Import individual files</button></div>`;
    return;
  }
  try {
    const files = (
      await native("listFiles", { uri: directoryStack.at(-1) })
    ).sort(
      (a: any, b: any) =>
        Number(b.directory) - Number(a.directory) ||
        a.name.localeCompare(b.name),
    );
    out.innerHTML =
      files
        .map(
          (f: any, index: number) =>
            `<div class="file-row"><button class="file-entry" data-file="${index}">${icon(f.directory ? "folder" : "file", 25)}<span>${E(f.name)}<small>${f.directory ? "Folder" : (f.size / 1048576).toFixed(2) + " MB"}</small></span></button><button class="appbar-button" data-file-menu="${index}" aria-label="Options for ${E(f.name)}">${icon("more", 21)}</button></div>`,
        )
        .join("") || '<p class="empty-small">Empty folder</p>';
    out.querySelectorAll<HTMLElement>("[data-file]").forEach(
      (button) =>
        (button.onclick = async () => {
          const f = files[Number(button.dataset.file)];
          if (f.directory) {
            directoryStack.push(f.uri);
            await render();
          } else if (supported.includes(ext(f.name))) {
            try {
              const staged = await native("openFile", { uri: f.uri });
              await importFiles([await nativeFile(staged)], true);
            } catch (e) {
              toast((e as Error).message, true);
            }
          } else toast("This file type is not supported.");
        }),
    );
    out.querySelectorAll<HTMLElement>("[data-file-menu]").forEach(
      (button) =>
        (button.onclick = () => {
          const f = files[Number(button.dataset.fileMenu)];
          const m = modal(
            f.name,
            `<div class="option-buttons">${[
              ["rename", "Rename"],
              ["copy", "Copy"],
              ["move", "Move"],
              ["delete", "Delete"],
            ]
              .map(
                ([id, label]) =>
                  `<button class="option-row" data-file-op="${id}"><span>${label}</span></button>`,
              )
              .join("")}</div>`,
          );
          m.querySelectorAll<HTMLElement>("[data-file-op]").forEach(
            (b) =>
              (b.onclick = async () => {
                try {
                  const op = b.dataset.fileOp;
                  closeModal();
                  if (op === "rename") {
                    const name = await inputDialog("Rename", "Name", f.name);
                    if (name) {
                      await native("renameFile", { uri: f.uri, name });
                      await render();
                    }
                  } else if (op === "copy" || op === "move") {
                    fileClipboard = {
                      uri: f.uri,
                      parent: directoryStack.at(-1)!,
                      name: f.name,
                      move: op === "move",
                    };
                    toast("Open the destination folder and choose Paste.");
                  } else if (
                    op === "delete" &&
                    (await confirmDialog(
                      "Delete file?",
                      `Delete “${f.name}” from this device folder? This cannot be undone from Books.`,
                      "Delete",
                    ))
                  ) {
                    await native("deleteFile", { uri: f.uri });
                    await render();
                    toast("File deleted.");
                  }
                } catch (e) {
                  toast((e as Error).message, true);
                }
              }),
          );
        }),
    );
  } catch (e) {
    out.innerHTML = `<p class="empty-small">${E((e as Error).message)}</p><button class="secondary" data-action="pick-folder">Choose a folder</button>`;
  }
}

async function renderSettings(page: HTMLElement) {
  const cloud = await getCloud().catch(() => null),
    locked = isNative() ? await native("lockStatus") : false;
  page.classList.add("native-settings");
  page.innerHTML = `${""}<label class="settings-search">${icon("search", 20)}<input id="settings-search" type="search" placeholder="Find a setting" aria-label="Find a setting"></label><p class="settings-no-results" hidden>No matching settings. Try “theme”, “backup”, or “cloud”.</p><div class="settings-layout">
  <details class="panel settings-panel"><summary><span class="settings-section-icon">${icon("sliders", 22)}</span><span><strong>General</strong><small>Appearance, language & your shelf</small></span>${icon("down", 18)}</summary><div class="settings-section-body"><button class="option-row" data-action="pin-widget"><span>Add shelf widget</span>${icon("chevron", 18)}</button>${select("language", "Language", settings.language, languages)}${select("motion", "Interface animations", settings.motion, { full: "Standard", reduced: "Reduced motion" })}${select("appTheme", "Theme", settings.appTheme, Object.fromEntries(Object.entries(appThemes).map(([id,t])=>[id,t.name])))}<button class="option-row" data-action="app-themes"><span>Explore interface themes</span>${icon("palette",20)}</button>${range("dailyGoal", "Daily reading goal", settings.dailyGoal, 5, 120, 5, " min")}${select("sort", "Sort by", settings.sort, { recent: "Recently read", added: "Date added", title: "Title", author: "Author" })}${select("view", "Bookshelf layout", settings.view, { grid: "Cover view", list: "List view" })}<button class="option-row" data-action="shelf-options"><span>Shelf Options</span>${icon("chevron", 18)}</button></div></details>
  <details class="panel settings-panel" ><summary><span class="settings-section-icon">${icon("cloud", 22)}</span><span><strong>Cloud synchronization</strong><small>Keep your place across devices</small></span>${icon("down", 18)}</summary><div class="settings-section-body">${toggle("autoSync", "Automatically sync reading position", settings.autoSync)}<button class="option-row" data-shortcut="profile"><span>Google Drive · Profile & backups</span>${icon("chevron",18)}</button><p class="connection-state">${cloud ? E(cloud.provider === "webdav" ? "WebDAV" : "Dropbox") : "No cloud connection"}</p><div class="settings-actions"><button class="secondary" data-action="connect-cloud">${cloud ? "Manage connection" : "Connect cloud"}</button><button class="primary" data-action="sync">Sync now</button><button class="secondary" data-action="cloud-backup">Upload full backup</button><button class="secondary" data-action="cloud-restore">Restore cloud backup</button></div></div></details>
  <details class="panel settings-panel" ><summary><span class="settings-section-icon">${icon("download", 22)}</span><span><strong>Backup and restore</strong><small>Keep a copy of your books & notes</small></span>${icon("down", 18)}</summary><div class="settings-section-body"><div class="settings-actions"><button class="secondary" data-action="backup">Create backup</button><button class="secondary" data-action="restore">Restore backup</button><button class="secondary" data-action="export-notes">Export notebook</button></div></div></details>
  <details class="panel settings-panel" ><summary><span class="settings-section-icon">${icon("folder", 22)}</span><span><strong>FTP / FTPS</strong><small>Browse books on your server</small></span>${icon("down", 18)}</summary><div class="settings-section-body"><button class="secondary" data-action="ftp">Browse FTP server</button></div></details>
  <details class="panel settings-panel" ><summary><span class="settings-section-icon">${icon("highlight", 22)}</span><span><strong>Readwise</strong><small>Send highlights to your Readwise library</small></span>${icon("down", 18)}</summary><div class="settings-section-body"><div class="settings-actions"><button class="secondary" data-action="readwise-connect">Connect Readwise</button><button class="secondary" data-action="readwise-export">Export highlights</button></div></div></details>
  <details class="panel settings-panel" ><summary><span class="settings-section-icon">${icon("lock", 22)}</span><span><strong>Password protection</strong><small>Keep your library private</small></span>${icon("down", 18)}</summary><div class="settings-section-body"><button class="secondary" data-action="${locked ? "remove-lock" : "set-lock"}">${locked ? "Remove startup password" : "Set startup password"}</button></div></details>
  <details class="panel settings-panel" ><summary><span class="settings-section-icon">${icon("info", 22)}</span><span><strong>About</strong><small>Version, credits & open-source notices</small></span>${icon("down", 18)}</summary><div class="settings-section-body"><p>Books 1.9.2</p><button class="secondary" data-action="about">About</button><button class="secondary" data-action="licenses">Open-source notices</button><button class="secondary" data-action="privacy">Privacy policy</button></div></details></div>`;
  page.querySelector("#settings-search")!.addEventListener("input", e => {
    const value = (e.target as HTMLInputElement).value.trim().toLowerCase();
    let shown = 0;
    page.querySelectorAll<HTMLDetailsElement>(".settings-panel").forEach((panel, i) => {
      panel.hidden = !!value && !panel.textContent?.toLowerCase().includes(value);
      panel.open = value ? !panel.hidden : false;
      if (!panel.hidden) shown++;
    });
    page.querySelector<HTMLElement>(".settings-no-results")!.hidden = shown > 0;
  });
  page
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]")
    .forEach((input) =>
      input.addEventListener("change", async () => {
        const key = input.dataset.setting!;
        (settings as any)[key] =
          input instanceof HTMLInputElement && input.type === "checkbox"
            ? input.checked
            : typeof (settings as any)[key] === "number"
            ? Number(input.value)
            : input.value;
        if (input.previousElementSibling?.querySelector("output"))
          input.previousElementSibling.querySelector("output")!.textContent =
            input.value + " min";
        await db.saveSettings(settings);
        setLanguage(settings.language);
        if (key === "motion") document.documentElement.dataset.motion = settings.motion;
        if (key === "appTheme") {
          document.documentElement.dataset.appTheme = settings.appTheme;
          updateAppChrome();
        }
      }),
    );
}
function connectCloud(provider = "webdav") {
  const m = modal(
    "Cloud synchronization",
    `<form id="cloud-form"><label class="field">Cloud provider<select name="provider"><option value="webdav">WebDAV / Nextcloud</option><option value="dropbox">Dropbox access token</option></select></label><div id="webdav-fields"><label class="field">WebDAV folder URL<input name="url" type="url" placeholder="https://cloud.example.com/remote.php/dav/files/user/Books/"></label><label class="field">Username<input name="username" autocomplete="username"></label><label class="field">App password<input name="password" type="password" autocomplete="off"></label></div><div id="dropbox-fields" hidden><label class="field">Dropbox access token<input name="token" type="password" autocomplete="off"></label><p class="small muted">Use a token with permission to read and write your Books folder.</p><details><summary>Keep Dropbox connected</summary><p class="small muted">If you have an offline authorization from Dropbox, add its app key and refresh token. Books will renew access automatically. Otherwise, replace your access token when it expires.</p><label class="field">Dropbox app key<input name="appKey" autocomplete="off" autocapitalize="none" spellcheck="false"></label><label class="field">Dropbox refresh token<input name="refreshToken" type="password" autocomplete="off"></label></details></div><p class="small muted">Use an existing WebDAV folder with write access. For Dropbox, create a /Books folder in the token’s app scope.</p><div class="dialog-actions"><button class="primary">Save connection ${icon("check", 16)}</button><button class="secondary" type="button" id="disconnect-cloud">Disconnect</button></div></form>`,
  );
  m.querySelector("#disconnect-cloud")!.addEventListener("click", async () => {
    await disconnectCloud();
    closeModal();
    await render();
    toast("Cloud disconnected.");
  });
  m.querySelector("select")!.onchange = (e) => {
    const drop = (e.target as HTMLSelectElement).value === "dropbox";
    m.querySelector<HTMLElement>("#webdav-fields")!.hidden = drop;
    m.querySelector<HTMLElement>("#dropbox-fields")!.hidden = !drop;
  };
  m.querySelector("select")!.value = provider;
  m.querySelector("select")!.dispatchEvent(new Event("change"));
  m.querySelector("form")!.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const c = {
      provider: fd.get("provider") as "webdav" | "dropbox",
      url: String(fd.get("url")).trim(),
      username: String(fd.get("username")),
      password: String(fd.get("password")),
      token: String(fd.get("token")).trim(),
      appKey: String(fd.get("appKey") ?? "").trim(),
      refreshToken: String(fd.get("refreshToken") ?? "").trim(),
    };
    try {
      if (c.provider === "webdav" && !c.url.startsWith("https://"))
        throw Error("Use an HTTPS WebDAV address to protect your credentials.");
      if (c.provider === "dropbox") {
        if (!!c.appKey !== !!c.refreshToken)
          throw Error("Enter both the Dropbox app key and refresh token, or leave both blank.");
        if (!c.token && !c.refreshToken)
          throw Error("Enter a Dropbox access token or an app key and refresh token.");
      }
      await setCloud(c);
      closeModal();
      await render();
      toast("Connection saved. Tap Sync now to test it.");
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
}
function showLicenses() {
  const names = [
    "Kokoro", "Sherpa-ONNX", "eSpeak-NG", "Piper-phonemize", "ONNX-Runtime",
    "Docx-preview",
    "JSZip",
    "Foliate",
    "MuPDF",
    "jchmlib",
    "Apache-Commons-Net",
    "Flyfish-UMD",
    "djvu-rs",
    "djvu-rs-dependencies",
    "Libarchive.js",
    "DOMPurify",
    "fflate",
    "Marked",
    "Lucide",
    "idb",
    "DejaVu",
    "Manrope",
    "literata", "lora", "merriweather", "crimsonpro", "ebgaramond", "sourceserif4", "notoserif", "atkinsonhyperlegiblenext", "lexend", "notosans", "opensans", "notoserifdevanagari", "notosansdevanagari",
  ];
  const m = modal(
    "Open-source notices",
    `<p>Books application code is licensed AGPL-3.0-or-later. Dependencies retain their respective licenses. Full application source is available at <a href="https://github.com/meridian-max/books-reader" target="_blank" rel="noopener">github.com/meridian-max/books-reader</a>. Upstream sources are listed in the third-party notices.</p><div class="option-buttons">${names.map((name) => `<button class="option-row" data-license="${name}"><span>${name}</span></button>`).join("")}</div>`,
  );
  m.querySelectorAll<HTMLElement>("[data-license]").forEach(
    (button) =>
      (button.onclick = async () => {
        try {
          const name = button.dataset.license!,
            response = await fetch("/licenses/" + name + ".txt");
          if (!response.ok) throw Error("License text is missing.");
          const content = await response.text();
          const view = modal(
            name,
            `<button class="secondary" id="license-back">Back to notices</button><pre style="white-space:pre-wrap;font:12px/1.6 monospace;margin-top:15px">${E(content)}</pre>`,
          );
          view
            .querySelector("#license-back")!
            .addEventListener("click", showLicenses);
        } catch (e) {
          toast((e as Error).message, true);
        }
      }),
  );
}
async function actions(action: string) {
  switch (action) {
    case "select-books":
      selectingBooks = !selectingBooks;
      selectedBooks.clear();
      if (
        !["library", "favorites", "recent", "downloads", "collection"].includes(
          route,
        )
      )
        route = "library";
      await render();
      break;
    case "shelf-selector":
      shelfSelector();
      break;
    case "shelf-filter":
      shelfFilter();
      break;
    case "shelf-options":
      shelfOptions();
      break;
    case "app-menu":
      appMenu();
      break;
    case "close-drawer":
      drawer(false);
      break;
    case "close-search":
      searchVisible = false;
      query = "";
      await render();
      break;
    case "app-exit":
      if (isNative()) await native("exit");
      else toast("You can close this tab.");
      break;
    case "app-night":
      settings.appTheme = settings.appTheme === "material" ? "classic" : "material";
      await db.saveSettings(settings);
      await render();
      break;
    case "continue-reading": {
      const current =
        sorted().find((b) => b.lastRead && !b.finished) ?? sorted()[0];
      if (current) await openBook(current.id);
      else actions("import");
      break;
    }
    case "sort-books": {
      const m = modal(
        "Sort by",
        select("sort", "Order", settings.sort, {
          recent: "Recently read",
          added: "Date added",
          title: "Title",
          author: "Author",
        }),
      );
      m.querySelector("select")!.addEventListener("change", async (e) => {
        settings.sort = (e.target as HTMLSelectElement).value;
        await db.saveSettings(settings);
        closeModal();
        renderBooks();
      });
      break;
    }
    case "sample-books": {
      const files: File[] = [];
      for (const name of ["alice", "pride", "sherlock", "frankenstein"]) {
        const r = await fetch("/samples/" + name + ".epub");
        if (!r.ok) throw Error("A bundled sample book is missing.");
        files.push(new File([await r.blob()], name + ".epub"));
      }
      route = "library";
      await importFiles(files);
      break;
    }

    case "import":
      if (isNative()) {
        const selected = await native("pickBooks");
        if (selected.length)
          await importFiles(await Promise.all(selected.map(nativeFile)));
      } else
        (document.querySelector("#file-input") as HTMLInputElement).click();
      break;
    case "view-grid":
    case "view-list":
      settings.view = action === "view-grid" ? "grid" : "list";
      await db.saveSettings(settings);
      await render();
      app
        .querySelectorAll(".view-switch .icon-button")
        .forEach((b) =>
          b.classList.toggle(
            "selected",
            (b as HTMLElement).dataset.action === action,
          ),
        );
      break;
    case "focus-search":
      if (!["library", "recent", "favorites", "collection", "downloads", "author-books", "series-books", "rating-books"].includes(route))
        route = "library";
      searchVisible = true;
      await render();
      app.querySelector<HTMLInputElement>("#library-search")?.focus();
      break;
    case "mobile-menu":
      drawer(!app.querySelector(".sidebar")!.classList.contains("mobile-open"));
      break;
    case "add-collection": {
      if (!books.length) {
        toast("Import a book first, then organize it into collections.");
        return;
      }
      const name = await inputDialog("A shelf of your own", "Collection name");
      if (!name) return;
      const m = modal(
        "Add books to " + name,
        `<form id="collection-books">${books.map((b) => `<label class="collection-book-check"><input type="checkbox" value="${b.id}"><span>${E(b.title)}</span><small>${E(b.author)}</small></label>`).join("")}<div class="dialog-actions"><button class="primary">Create collection ${icon("check", 16)}</button></div></form>`,
      );
      m.querySelector("form")!.onsubmit = async (e) => {
        e.preventDefault();
        const selected = [
          ...m.querySelectorAll<HTMLInputElement>("input:checked"),
        ];
        if (!selected.length) return toast("Choose at least one book.");
        for (const input of selected) {
          const b = books.find((b) => b.id === input.value)!;
          if (!b.tags.includes(name)) b.tags.push(name);
          await db.putBook(b);
        }
        collection = name;
        route = "collection";
        closeModal();
        await reload();
      };
      break;
    }
    case "cloud-backup":
      toast("Uploading your library…");
      await backupToCloud();
      toast("Full cloud backup uploaded.");
      break;
    case "cloud-restore":
      toast("Downloading your library…");
      const restored = await restoreFromCloud();
      await reload();
      toast(restored + " books restored from cloud.");
      break;
    case "backup":
      toast("Preparing your backup…");
      await backup();
      toast("Backup exported.");
      break;
    case "restore":
      (document.querySelector("#restore-input") as HTMLInputElement).click();
      break;
    case "export-notes":
      await exportNotes();
      toast("Notebook exported.");
      break;
    case "sync":
      toast("Syncing reading positions and notes…");
      await sync();
      await reload();
      toast("Your reading state is synced.");
      break;
    case "connect-cloud":
      connectCloud();
      break;
    case "pick-folder": {
      const uri = await native("pickTree");
      directoryStack = [uri];
      await render();
      break;
    }
    case "daily-goal": {
      const goal = await inputDialog(
        "Daily reading goal",
        "Daily reading goal in minutes",
        String(settings.dailyGoal),
        "number",
      );
      if (goal && Number(goal) >= 1 && Number(goal) <= 240) {
        settings.dailyGoal = Number(goal);
        await db.saveSettings(settings);
        await render();
      }
      break;
    }
    case "app-themes": {
      const m=modal("Make it yours",appThemeGallery(settings.appTheme));
      bindThemeFilters(m,'[data-app-palette]');
      m.querySelectorAll<HTMLElement>('[data-app-palette]').forEach(b=>b.onclick=async()=>{settings.appTheme=b.dataset.appPalette as Settings['appTheme'];document.documentElement.dataset.appTheme=settings.appTheme;updateAppChrome();await db.saveSettings(settings);m.querySelectorAll('[data-app-palette]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));m.querySelector('.theme-current strong')!.textContent=appThemes[settings.appTheme].name;});break;
    }
    case "download-book": {
      const m=modal("Download books",`<div class="download-emblem">${icon("download",36)}</div><p class="small">Paste a direct link to an EPUB, PDF, text book or comic. Downloaded books stay available offline.</p><form id="download-book-form"><label class="field">Book file link<input type="url" name="url" placeholder="https://example.com/book.epub" required autocomplete="off"></label><p class="download-status" role="status"></p><button class="primary full-width" type="submit">${icon("download",18)} Download to library</button></form><button class="option-row" id="download-catalogs">${icon("globe",20)}<span>Browse book catalogs</span>${icon("chevron",18)}</button><button class="option-row" id="download-saved">${icon("library",20)}<span>My downloaded books</span>${icon("chevron",18)}</button>`);
      const abort=new AbortController();m.addEventListener('modalclose',()=>abort.abort(),{once:true});
      m.querySelector<HTMLElement>('#download-catalogs')!.onclick=async()=>{closeModal();route='catalogs';await render()};m.querySelector<HTMLElement>('#download-saved')!.onclick=async()=>{closeModal();route='downloads';await render()};
      m.querySelector<HTMLFormElement>('form')!.onsubmit=async e=>{e.preventDefault();const b=m.querySelector<HTMLButtonElement>('button[type=submit]')!,out=m.querySelector<HTMLElement>('.download-status')!;b.disabled=true;try{const file=await downloadBook(String(new FormData(e.target as HTMLFormElement).get('url')),text=>{if(m.isConnected)out.textContent=text},abort.signal);if(abort.signal.aborted)return;closeModal();route='downloads';query='';filter='all';await importFiles([file]);}catch(error){if(!abort.signal.aborted)out.textContent=(error as Error).message;}finally{b.disabled=false}};break;
    }
    case "add-catalog": {
      const m = modal(
        "Add catalog",
        `<form id="catalog-form"><label class="field">Library name<input name="name" required placeholder="My Calibre library"></label><label class="field">OPDS catalog URL<input name="url" type="url" required placeholder="http://192.168.1.10:8080/opds"></label><div class="dialog-actions"><button class="primary">Add library ${icon("plus", 16)}</button></div></form>`,
      );
      m.querySelector("form")!.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);
        settings.catalogs.push({
          id: uid(),
          name: String(fd.get("name")),
          url: String(fd.get("url")),
        });
        await db.saveSettings(settings);
        closeModal();
        await render();
      };
      break;
    }
    case "home-files-options": {
      const m = modal("My Files", '<div class="native-choice-list"><button data-connection="dropbox">Dropbox</button><button data-connection="webdav">WebDAV</button><button data-connection="ftp">FTP / FTPS</button><button data-connection="device">Device files</button></div>');
      m.querySelectorAll<HTMLElement>("[data-connection]").forEach(button => button.onclick = async () => {
        closeModal();
        if (button.dataset.connection === "device") { route = "files"; await render(); }
        else if (button.dataset.connection === "ftp") await actions("ftp");
        else await connectCloud(button.dataset.connection!);
      });
      break;
    }
    case "ftp":
      await browseFtp(async file => { await importFiles([file]); });
      break;
    case "readwise-connect":
      await readwiseSettings();
      break;
    case "readwise-export":
      await exportReadwise();
      break;
    case "set-lock": {
      if (!isNative())
        throw Error("Startup protection is available in the Android app.");
      const pin = await inputDialog(
        "Password protection",
        "Choose a password (at least 4 characters)",
        "",
        "password",
      );
      if (pin) {
        const confirm = await inputDialog(
          "Confirm your password",
          "Enter it once more",
          "",
          "password",
        );
        if (pin !== confirm) throw Error("The passwords did not match.");
        await native("setPin", { pin });
        toast("Startup protection enabled.");
        await render();
      }
      break;
    }
    case "remove-lock": {
      const pin = await inputDialog(
        "Remove startup protection",
        "Current password",
        "",
        "password",
      );
      if (pin) {
        if (!(await native("unlock", { pin, remove: true })))
          throw Error("Incorrect password.");
        await render();
        toast("Startup password removed.");
      }
      break;
    }
    case "pin-widget":
      if (isNative()) await native("pinWidget");
      else toast("This action requires the Android app.");
      break;
    case "privacy": {
      const response = await fetch("/privacy.html");
      if (!response.ok) throw Error("Privacy policy could not be opened.");
      const document = new DOMParser().parseFromString(await response.text(), "text/html");
      modal("Privacy policy", `<div class="about-copy">${document.querySelector("article")!.innerHTML}</div>`);
      break;
    }
    case "licenses":
      showLicenses();
      break;
    case "about":
      modal(
        "About Books",
        `<div class="about-copy"><img src="/icon.svg" alt="Books"><h3>Books</h3><p>Version 1.9.2 · Android</p><p>Read ebooks, PDFs, comics, and documents offline. Organize your library, mark passages, listen to books, and sync your place across devices.</p><p>Supported formats: EPUB, PDF, DjVu, MOBI/AZW3, FB2, CHM, UMD, CBZ/CBR, DOCX, ODT, RTF, TXT, HTML, MHTML, Markdown, and images.</p><p><a href="/licenses/" id="license-link">Open-source notices</a></p></div>`,
        { wide: true },
      );
      document
        .querySelector("#license-link")!
        .addEventListener("click", (e) => {
          e.preventDefault();
          showLicenses();
        });
      break;
  }
}
app.addEventListener("click", async (e) => {
  const target = (e.target as Element).closest<HTMLElement>("button,a");
  if (!target) return;
  try {
    if (target.dataset.nav || target.dataset.tab || target.dataset.shortcut) {
      route = (target.dataset.nav ?? target.dataset.tab ?? target.dataset.shortcut)!;
      query = "";
      filter = "all";
      await render();
    } else if (target.dataset.catalog) await browseCatalog(settings.catalogs.find(c => c.id === target.dataset.catalog)?.url ?? target.dataset.catalog);
    else if (target.dataset.author || target.dataset.series || target.dataset.ratingGroup !== undefined) {
      route = target.dataset.author ? "author-books" : target.dataset.series ? "series-books" : "rating-books";
      collection = target.dataset.author ?? target.dataset.series ?? target.dataset.ratingGroup!;
      filter = "all"; query = ""; await render();
    } else if (target.dataset.cloudProvider)
      connectCloud(target.dataset.cloudProvider);
    else if (target.dataset.action) await actions(target.dataset.action);
    else if (target.dataset.open) {
      if (selectingBooks) {
        selectedBooks.has(target.dataset.open)
          ? selectedBooks.delete(target.dataset.open)
          : selectedBooks.add(target.dataset.open);
        renderBooks(Number(app.querySelector<HTMLElement>("#books-grid")?.dataset.limit ?? BOOK_BATCH));
      } else await openBook(target.dataset.open);
    } else if (target.dataset.bookMenu) await bookMenu(target.dataset.bookMenu);
    else if (target.dataset.filter) {
      filter = target.dataset.filter;
      app.querySelectorAll<HTMLElement>("[data-filter]").forEach((b) => {
        b.classList.toggle("active", b === target);
        b.setAttribute("aria-selected", String(b === target));
      });
      renderBooks();
    } else if (target.dataset.collection) {
      route = "collection";
      collection = target.dataset.collection;
      filter = "all";
      await render();
    }
  } catch (e) {
    toast((e as Error).message, true);
  }
});
(document.querySelector("#file-input") as HTMLInputElement).onchange = async (
  e,
) => {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (files.length)
    try {
      await importFiles(files);
    } catch (e) {
      toast((e as Error).message, true);
    }
};
(document.querySelector("#restore-input") as HTMLInputElement).onchange =
  async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      toast("Restoring your library…");
      const count = await restore(file);
      await reload();
      toast(`${count} books restored.`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
let dragging = 0;
document.addEventListener("dragenter", (e) => {
  e.preventDefault();
  if (e.dataTransfer?.types.includes("Files")) {
    dragging++;
    document.body.classList.add("dragging");
  }
});
document.addEventListener("dragleave", () => {
  if (--dragging <= 0) document.body.classList.remove("dragging");
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragging = 0;
  document.body.classList.remove("dragging");
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) importFiles(files).catch((e) => toast(e.message, true));
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !reader &&
    !(e.target as Element).matches("input,textarea")
  ) {
    e.preventDefault();
    actions("focus-search");
  }
});
window.addEventListener("native:error", ((e: CustomEvent) =>
  toast(e.detail, true)) as unknown as EventListener);
window.addEventListener("native:openBook", ((e: CustomEvent) =>
  openBook(e.detail)) as unknown as EventListener);
window.addEventListener("native:import", (async (e: CustomEvent) => {
  await importFiles([await nativeFile(e.detail)], true);
}) as unknown as EventListener);
window.addEventListener("native:back", () => {
  if (!reader) {
    if (document.querySelector(".modal")) closeModal();
    else if (app.querySelector(".sidebar.mobile-open")) drawer(false);
    else {
      route = "library";
      render();
    }
  }
});
async function unlock() {
  if (!isNative() || !(await native("lockStatus"))) return;
  await new Promise<void>((resolve) => {
    const curtain = document.createElement("div");
    curtain.className = "lock-screen";
    curtain.innerHTML = `<img src="/icon.svg" alt="Books"><h1>Books</h1><p>Enter your password to unlock.</p><form><input type="password" placeholder="Your password" aria-label="Books password" required autocomplete="current-password"><button class="primary">Unlock ${icon("arrow", 16)}</button></form><button class="subtle" id="unlock-biometric">${icon("lock", 17)} Use device biometrics</button><p id="lock-error" role="alert"></p>`;
    document.body.append(curtain);
    const done = () => {
      curtain.remove();
      resolve();
    };
    curtain.querySelector("form")!.onsubmit = async (e) => {
      e.preventDefault();
      if (
        await native("unlock", {
          pin: (curtain.querySelector("input") as HTMLInputElement).value,
        })
      )
        done();
      else
        curtain.querySelector("#lock-error")!.textContent =
          "That password did not match. Please try again.";
    };
    curtain.querySelector("#unlock-biometric")!.addEventListener("click", () =>
      native("biometric")
        .then(done)
        .catch(
          (e) =>
            (curtain.querySelector("#lock-error")!.textContent = e.message),
        ),
    );
  });
}
async function init() {
  await unlock();
  await reload();
  if (isNative()) await native("ready");
}
init().catch((e) => {
  app.innerHTML = `<div class="empty-state"><h1>Books couldn’t start.</h1><p>${E(e.message)}</p><p>Close and reopen the app. Your local library has been preserved.</p></div>`;
});

document.addEventListener("keydown", e => { if (e.key === "Escape" && app.querySelector(".sidebar.mobile-open")) drawer(false); });
