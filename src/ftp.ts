import { ext, supported } from "./formats";
import { isNative, native, nativeFile } from "./native";
import { escapeHTML as E } from "./types";
import { closeModal, confirmDialog, icon, inputDialog, modal, toast } from "./ui";

type Config = { host: string; port: number; username: string; password: string; tls: boolean; path: string };
type Entry = { name: string; path: string; directory: boolean; size: number };
type Listing = { path: string; entries: Entry[] };
const join = (directory: string, name: string) => directory.replace(/\/$/, "") + "/" + name;
const validName = (name: string) => !!name.trim() && !/[\/\\\r\n\0]/.test(name) && ![".", ".."].includes(name);

export async function browseFtp(onImport: (file: File) => Promise<void>, reconnect = false) {
  if (!isNative()) {
    modal("FTP / FTPS", "<p>FTP browsing is available in the Android app. Connect a server to download books, upload files, and manage folders.</p>");
    return;
  }
  const saved: Config | null = await native("getFtp");
  if (saved && !reconnect) {
    await openFolder(saved.path || "/", onImport);
    return;
  }
  const m = modal("FTP / FTPS", `<form id="ftp-connect"><label class="field">Server<input name="host" required value="${E(saved?.host || "")}" placeholder="ftp.example.com" autocapitalize="none"></label><label class="field">Port<input name="port" type="number" min="1" max="65535" required value="${saved?.port || 21}"></label><label class="field">Username<input name="username" required value="${E(saved?.username || "anonymous")}" autocomplete="username"></label><label class="field">Password<input name="password" type="password" value="${E(saved?.password || "")}" autocomplete="current-password"></label><label class="field">Starting folder<input name="path" value="${E(saved?.path || "/")}" autocapitalize="none"></label><label class="toggle-field"><span>Use explicit TLS (FTPS)<small>Plain FTP sends credentials and files without encryption.</small></span><input name="tls" type="checkbox" ${saved?.tls === false ? "" : "checked"}><span class="switch"></span></label><p id="ftp-status" role="status"></p><div class="dialog-actions">${saved ? '<button type="button" id="ftp-disconnect" class="secondary">Disconnect</button>' : ""}<button class="primary" type="submit">Connect</button></div></form>`);
  m.querySelector("#ftp-disconnect")?.addEventListener("click", async () => { await native("clearFtp"); closeModal(); toast("FTP disconnected."); });
  m.querySelector("form")!.onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    const config: Config = { host: String(form.get("host")).trim(), port: Number(form.get("port")), username: String(form.get("username")), password: String(form.get("password")), tls: form.has("tls"), path: String(form.get("path")).trim() || "/" };
    const button = m.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true;
    try {
      m.querySelector("#ftp-status")!.textContent = "Connecting…";
      const listing: Listing = await native("ftp", { operation: "list", path: config.path, config });
      config.path = listing.path;
      await native("setFtp", config);
      if (m.isConnected) await openFolder(listing.path, onImport, listing);
    } catch (error) { if (m.isConnected) m.querySelector("#ftp-status")!.textContent = (error as Error).message; }
    finally { button.disabled = false; }
  };
}

async function openFolder(path: string, onImport: (file: File) => Promise<void>, initial?: Listing) {
  const m = modal("FTP", '<p class="loading-inline">Opening folder…</p>', { wide: true, subtitle: path });
  let listing: Listing;
  try { listing = initial || await native("ftp", { operation: "list", path }); }
  catch (error) {
    if (!m.isConnected) return;
    m.querySelector(".modal-body")!.innerHTML = `<p>${E((error as Error).message)}</p><button class="secondary" id="ftp-reconnect">Connection settings</button>`;
    m.querySelector("#ftp-reconnect")!.addEventListener("click", () => browseFtp(onImport, true));
    return;
  }
  if (!m.isConnected) return;
  path = listing.path;
  listing.entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  m.querySelector(".modal-body")!.innerHTML = `<div class="ftp-toolbar"><button class="icon-button" id="ftp-up" aria-label="Parent folder" ${path === "/" ? "disabled" : ""}>${icon("back")}</button><span>${E(path)}</span><button class="icon-button" id="ftp-refresh" aria-label="Refresh">${icon("refresh")}</button><button class="icon-button" id="ftp-settings" aria-label="FTP settings">${icon("settings")}</button></div><div class="settings-actions"><button class="secondary" id="ftp-mkdir">${icon("collection", 17)} New folder</button><label class="secondary ftp-upload">${icon("upload", 17)} Upload<input type="file" id="ftp-upload" hidden></label></div><div class="ftp-files">${listing.entries.map((entry, index) => `<div class="ftp-file"><button data-ftp-open="${index}">${icon(entry.directory ? "folder" : "book", 22)}<span>${E(entry.name)}<small>${entry.directory ? "Folder" : (entry.size / 1024).toFixed(1) + " KB"}</small></span></button><button class="icon-button" data-ftp-menu="${index}" aria-label="Options for ${E(entry.name)}">${icon("more")}</button></div>`).join("") || '<p class="empty-small">This folder is empty.</p>'}</div><p id="ftp-progress" role="status"></p>`;
  const refresh = () => openFolder(path, onImport);
  m.querySelector("#ftp-up")!.addEventListener("click", () => openFolder(path.replace(/\/$/, "").replace(/\/[^/]*$/, "") || "/", onImport));
  m.querySelector("#ftp-refresh")!.addEventListener("click", refresh);
  m.querySelector("#ftp-settings")!.addEventListener("click", () => browseFtp(onImport, true));
  m.querySelector("#ftp-mkdir")!.addEventListener("click", async () => {
    const name = await inputDialog("New FTP folder", "Folder name");
    if (name === null) { await refresh(); return; }
    try { if (!validName(name)) throw Error("Use a name without slashes or control characters."); await native("ftp", { operation: "mkdir", path: join(path, name) }); await refresh(); }
    catch (error) { await refresh(); toast((error as Error).message, true); }
  });
  m.querySelector<HTMLInputElement>("#ftp-upload")!.onchange = async event => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = "";
    if (!file) return;
    try {
      if (file.size > 128 * 1024 * 1024) throw Error("FTP uploads must be smaller than 128 MB.");
      if (!validName(file.name)) throw Error("This file name cannot be used on FTP.");
      if (listing.entries.some(entry => entry.name === file.name)) throw Error("A file with that name already exists. Rename it first.");
      m.querySelector("#ftp-progress")!.textContent = "Uploading…";
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      await native("ftp", { operation: "upload", path: join(path, file.name), base64: btoa(binary) });
      if (m.isConnected) await refresh();
      toast("File uploaded.");
    } catch (error) { if (m.isConnected) m.querySelector("#ftp-progress")!.textContent = (error as Error).message; }
  };
  m.querySelectorAll<HTMLButtonElement>("[data-ftp-open]").forEach(button => button.onclick = async () => {
    const entry = listing.entries[Number(button.dataset.ftpOpen)];
    if (entry.directory) { await openFolder(entry.path, onImport); return; }
    if (!supported.includes(ext(entry.name))) { toast("This file format is not supported by Books.", true); return; }
    button.disabled = true;
    try {
      m.querySelector("#ftp-progress")!.textContent = "Downloading " + entry.name + "…";
      const record = await native("ftp", { operation: "download", path: entry.path });
      const file = await nativeFile(record);
      if (m.isConnected) closeModal();
      await onImport(file);
    } catch (error) { if (m.isConnected) m.querySelector("#ftp-progress")!.textContent = (error as Error).message; else toast((error as Error).message, true); }
    finally { button.disabled = false; }
  });
  m.querySelectorAll<HTMLElement>("[data-ftp-menu]").forEach(button => button.onclick = () => {
    const entry = listing.entries[Number(button.dataset.ftpMenu)];
    const menu = modal(entry.name, `<div class="native-choice-list"><button id="ftp-rename">Rename</button><button id="ftp-delete">Delete ${entry.directory ? "empty folder" : "file"}</button><button id="ftp-cancel">Cancel</button></div>`);
    menu.querySelector("#ftp-cancel")!.addEventListener("click", refresh);
    menu.querySelector("#ftp-rename")!.addEventListener("click", async () => {
      const name = await inputDialog("Rename FTP item", "New name", entry.name);
      try {
        if (name !== null && name !== entry.name) {
          if (!validName(name)) throw Error("Use a name without slashes or control characters.");
          if (listing.entries.some(item => item.name === name)) throw Error("An item with that name already exists.");
          await native("ftp", { operation: "rename", path: entry.path, destination: join(path, name) });
        }
        await refresh();
      } catch (error) { await refresh(); toast((error as Error).message, true); }
    });
    menu.querySelector("#ftp-delete")!.addEventListener("click", async () => {
      try {
        if (await confirmDialog("Delete from FTP?", `Permanently delete “${entry.name}” from the server?`, "Delete"))
          await native("ftp", { operation: "delete", path: entry.path, directory: entry.directory });
        await refresh();
      } catch (error) { await refresh(); toast((error as Error).message, true); }
    });
  });
}
