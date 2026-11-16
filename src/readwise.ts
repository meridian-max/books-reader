import { db } from "./db";
import { isNative, native, network } from "./native";
import { closeModal, icon, modal, toast } from "./ui";
import { escapeHTML as E, type Book, type Mark } from "./types";

const endpoint = "https://readwise.io/api/v2/";
let sessionToken = "";
const limit = (value: string, length: number) => Array.from(value).slice(0, length).join("");

async function token() {
  return isNative() ? String((await native("getReadwise"))?.token ?? "") : sessionToken;
}

async function request(path: string, access: string, body?: unknown) {
  const response = await network(endpoint + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Token " + access, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401 || response.status === 403)
    throw Error("Readwise did not accept this access token. Reconnect in Readwise settings.");
  if (response.status === 429)
    throw Error(`Readwise's request limit was reached. Retry in ${response.headers.get("Retry-After") || "60"} seconds.`);
  if (!response.ok) throw Error("Readwise export failed (HTTP " + response.status + "). Your local highlights are saved.");
  return response;
}

function payload(mark: Mark, book: Book, order: number) {
  // Export is one-way; Readwise de-duplicates title/author/text. No public
  // source URLs are invented for private books stored only on the device.
  const parts = mark.quote.match(/[\s\S]{1,8191}/gu) ?? [];
  return parts.map((text, index) => ({
    text,
    title: limit(book.title, 511),
    author: limit(book.author, 1024),
    note: limit(mark.note, 8191),
    source_type: "books_android",
    category: "books",
    location_type: typeof mark.location === "number" ? "page" : "order",
    location: typeof mark.location === "number" ? mark.location + 1 : order + index,
    highlighted_at: new Date(mark.created).toISOString(),
  }));
}

export async function readwiseSettings() {
  const connected = !!(await token());
  const m = modal("Readwise", `<form id="readwise-form"><p>Export your highlights and notes to your Readwise library.</p><label class="field">Access token<input name="token" type="password" autocomplete="off" required placeholder="Readwise access token"></label><p class="small muted">Get your token at <a href="https://readwise.io/access_token" target="_blank" rel="noopener">readwise.io/access_token</a>. ${isNative() ? "Books encrypts it using Android Keystore." : "This preview keeps it only for this session."}</p><div class="dialog-actions"><button class="primary" type="submit">${connected ? "Reconnect" : "Connect"}</button>${connected ? '<button class="secondary" id="readwise-disconnect" type="button">Disconnect</button>' : ""}</div><p class="readwise-status" role="status">${connected ? "Connected" : "Not connected"}</p></form>`);
  m.querySelector("#readwise-disconnect")?.addEventListener("click", async () => {
    if (isNative()) await native("clearReadwise");
    sessionToken = "";
    closeModal();
    toast("Readwise disconnected.");
  });
  m.querySelector("form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = m.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const status = m.querySelector(".readwise-status")!;
    button.disabled = true;
    try {
      const access = m.querySelector<HTMLInputElement>('input[name="token"]')!.value.trim();
      if (!access) throw Error("Enter your Readwise access token.");
      status.textContent = "Connecting…";
      await request("auth/", access);
      if (isNative()) await native("setReadwise", { token: access });
      else sessionToken = access;
      closeModal();
      toast("Readwise connected.");
    } catch (error) { status.textContent = (error as Error).message; }
    finally { button.disabled = false; }
  });
}

export async function exportReadwise(bookId?: string) {
  const access = await token();
  if (!access) { await readwiseSettings(); return; }
  const [books, marks] = await Promise.all([db.books(), db.marks(bookId)]);
  const byId = new Map(books.map(book => [book.id, book]));
  const chosen = marks.filter(mark => mark.type !== "bookmark" && mark.quote.trim() && byId.has(mark.bookId)).sort((a, b) => a.created - b.created);
  const highlights = chosen.flatMap((mark, order) => payload(mark, byId.get(mark.bookId)!, order));
  const m = modal("Export to Readwise", `<p>${highlights.length ? `${chosen.length} saved passage${chosen.length === 1 ? "" : "s"}${bookId ? " from “" + E(byId.get(bookId)?.title) + "”" : " from your library"} will be exported, including their notes.` : "No highlights to export. Select text in a book to add a highlight first."}</p><p class="small muted">Your local notebook stays in Books. Readwise avoids duplicate passages with the same title, author and text.</p><p id="readwise-progress" role="status"></p><div class="dialog-actions"><button class="secondary" id="readwise-manage">Connection</button><button class="primary" id="readwise-export" ${highlights.length ? "" : "disabled"}>${icon("upload", 16)} Export highlights</button></div>`);
  m.querySelector("#readwise-manage")!.addEventListener("click", () => readwiseSettings().catch(error => toast(error.message, true)));
  m.querySelector("#readwise-export")!.addEventListener("click", async () => {
    const button = m.querySelector<HTMLButtonElement>("#readwise-export")!;
    const status = m.querySelector("#readwise-progress")!;
    button.disabled = true;
    let sent = 0;
    try {
      for (let index = 0; index < highlights.length; index += 100) {
        status.textContent = `Exporting ${index + 1}–${Math.min(index + 100, highlights.length)} of ${highlights.length}…`;
        await request("highlights/", access, { highlights: highlights.slice(index, index + 100) });
        sent += Math.min(100, highlights.length - index);
      }
      status.textContent = `Export complete: ${chosen.length} saved passages sent to Readwise.`;
      button.textContent = "Export complete";
    } catch (error) { status.textContent = `${sent ? sent + " highlights exported before the error. " : ""}${(error as Error).message}`; button.disabled = false; }
  });
}
