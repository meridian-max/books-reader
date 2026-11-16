import { strToU8, strFromU8 } from "fflate";
import { avatars } from "./profile-data";
import { db } from "./db";
import { defaults, type Book, type Mark, type Session } from "./types";
import { saveFile, network, native, isNative } from "./native";
function archive(
  operation: "zip" | "unzip",
  payload: Record<string, unknown>,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./backup-worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error("Backup processing timed out."));
    }, 120000);
    const done = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = ({ data }) => {
      done();
      data.error ? reject(Error(data.error)) : resolve(data.result);
    };
    worker.onerror = () => {
      done();
      reject(Error("Could not process this backup."));
    };
    worker.postMessage({ operation, ...payload });
  });
}
export async function backupBlob() {
  const { books, marks, sessions, settings, profile } = await db.snapshot();
  if (books.reduce((sum, b) => sum + b.blob.size, 0) > 480 * 1024 * 1024)
    throw Error(
      "This library exceeds the 480 MB backup limit. Export books separately to reduce its size.",
    );
  const files: Record<string, Uint8Array> = {};
  const checksums: Record<string, string> = {};
  for (const b of books) {
    files["books/" + b.id] = new Uint8Array(await b.blob.arrayBuffer());
    checksums[b.id] = await checksum(files["books/" + b.id]);
  }
  const metadata = {
    version: 2,
    created: new Date().toISOString(),
    checksums,
    books: books.map(({ blob, sourceUri, ...b }) => b),
    marks,
    sessions,
    settings,
    profile,
  };
  files["manifest.json"] = strToU8(JSON.stringify(metadata));
  return new Blob([await archive("zip", { files })], {
    type: "application/zip",
  });
}
async function checksum(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function backup() {
  await saveFile(
    "Books-" + new Date().toISOString().slice(0, 10) + ".books",
    await backupBlob(),
  );
}
export async function restore(file: File) {
  if (file.size > 512 * 1024 * 1024) throw Error("The backup exceeds 512 MB.");
  const files = (await archive("unzip", {
    bytes: new Uint8Array(await file.arrayBuffer()),
  })) as Record<string, Uint8Array>;
  if (!files["manifest.json"]) throw Error("This is not a Books backup.");
  const m = JSON.parse(strFromU8(files["manifest.json"]));
  if (
    ![1, 2].includes(m.version) ||
    !Array.isArray(m.books) ||
    !Array.isArray(m.marks) ||
    !Array.isArray(m.sessions)
  )
    throw Error("The backup manifest is invalid.");
  const books: Book[] = [];
  for (const b of m.books) {
    if (
      !/^[a-f0-9]{64}$/.test(b.id) ||
      typeof b.title !== "string" ||
      typeof b.filename !== "string" ||
      !files["books/" + b.id]
    )
      throw Error("A book record is damaged.");
    // A PDF can contain edited annotations while retaining its library identity.
    // Verify the snapshot bytes, never assume the book ID still hashes its content.
    if (
      (m.version === 2 &&
        (!/^[a-f0-9]{64}$/.test(m.checksums?.[b.id]) ||
          (await checksum(files["books/" + b.id])) !== m.checksums[b.id])) ||
      !Number.isFinite(b.lastRead) ||
      !Number.isFinite(b.progress) ||
      b.progress < 0 ||
      b.progress > 1 ||
      !Array.isArray(b.tags)
    )
      throw Error("A book record is damaged. Nothing was restored.");
    delete b.sourceUri;
    books.push({ ...b, blob: new Blob([files["books/" + b.id]]) });
  }
  const ids = new Set(books.map((b) => b.id));
  for (const n of m.marks)
    if (
      !ids.has(n.bookId) ||
      !Number.isFinite(n.created) ||
      !Number.isFinite(n.updated) ||
      typeof n.id !== "string" ||
      typeof n.bookId !== "string" ||
      typeof n.quote !== "string" ||
      typeof n.note !== "string"
    )
      throw Error("A notebook record is damaged.");
  for (const s of m.sessions)
    if (
      !ids.has(s.bookId) ||
      typeof s.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
      typeof s.id !== "string" ||
      !Number.isFinite(s.seconds) ||
      s.seconds < 0
    )
      throw Error("A reading session is damaged.");
  const preferences: { settings?: typeof defaults; profile?: unknown } = {};
  if (m.settings && typeof m.settings === "object") {
    const s = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof typeof defaults)[])
      if (
        m.settings[k] !== null &&
        typeof m.settings[k] === typeof defaults[k] &&
        Array.isArray(m.settings[k]) === Array.isArray(defaults[k])
      )
        (s as any)[k] = m.settings[k];
    preferences.settings = s;
  }
  if (
    m.profile &&
    typeof m.profile.name === "string" &&
    typeof m.profile.avatar === "string"
  )
    preferences.profile = {
      name: m.profile.name.trim().slice(0, 60),
      avatar: avatars.includes(m.profile.avatar) ? m.profile.avatar : "book",
      joined: Number.isFinite(m.profile.joined) ? m.profile.joined : Date.now(),
    };
  await db.merge(books, m.marks, m.sessions, preferences);
  return books.length;
}
export async function exportNotes(bookId?: string) {
  const marks = await db.marks(bookId),
    books = await db.books();
  const content = marks
    .map((m) => {
      const b = books.find((b) => b.id === m.bookId);
      return `## ${b?.title ?? "Book"}\n\n${m.quote ? "> " + m.quote.replace(/\n/g, "\n> ") : "Bookmark"}\n\n${m.note}\n\n${new Date(m.created).toLocaleString()}\n`;
    })
    .join("\n---\n\n");
  await saveFile(
    "Books-notebook.md",
    new Blob([content], { type: "text/markdown" }),
  );
}
export interface CloudConfig {
  provider: "webdav" | "dropbox";
  url: string;
  username: string;
  password: string;
  token: string;
}
export async function getCloud(): Promise<CloudConfig | null> {
  return isNative() ? native("getCloud") : null;
}
export async function setCloud(config: CloudConfig) {
  if (!isNative())
    throw Error("Cloud credentials are stored securely in the Android app.");
  await native("setCloud", config);
}
async function cloudRequest(
  config: CloudConfig,
  method: string,
  body?: string | Blob,
  path = "reading-state.json",
) {
  if (config.provider === "webdav") {
    const base = config.url.replace(/\/+$/, "");
    return network(base + "/" + path, {
      method,
      headers: {
        Authorization:
          "Basic " +
          btoa(
            unescape(
              encodeURIComponent(config.username + ":" + config.password),
            ),
          ),
        "Content-Type":
          body instanceof Blob ? "application/zip" : "application/json",
      },
      body,
    });
  }
  const download = method === "GET";
  return network(
    "https://content.dropboxapi.com/2/files/" +
      (download ? "download" : "upload"),
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.token,
        "Dropbox-API-Arg": JSON.stringify(
          download
            ? { path: "/Books/" + path }
            : {
                path: "/Books/" + path,
                mode: "overwrite",
                autorename: false,
                mute: true,
              },
        ),
        ...(!download ? { "Content-Type": "application/octet-stream" } : {}),
      },
      body: download ? undefined : body,
    },
  );
}
let activeSync: Promise<boolean> | undefined;
export function sync(): Promise<boolean> {
  return (activeSync ??= performSync().finally(() => {
    activeSync = undefined;
  }));
}
async function performSync() {
  const c = await getCloud();
  if (!c) throw Error("Connect WebDAV or Dropbox in Settings first.");
  const local = await db.books();
  const response = await cloudRequest(c, "GET");
  if (response.ok) {
    const remote = await response.json();
    if (
      remote.version !== 1 ||
      !Array.isArray(remote.books) ||
      !Array.isArray(remote.marks) ||
      !Array.isArray(remote.sessions)
    )
      throw Error("The cloud reading state has an unknown format.");
    const books = remote.books
      .map((b: any) => {
        const old = local.find((x) => x.id === b.id);
        if (!old) return null;
        const fraction = Number(b.progress);
        return {
          ...old,
          progress: Number.isFinite(fraction)
            ? Math.max(0, Math.min(1, fraction))
            : old.progress,
          location:
            typeof b.location === "number" || typeof b.location === "string"
              ? b.location
              : old.location,
          lastRead: Number(b.lastRead) || 0,
          finished: !!b.finished,
        };
      })
      .filter(Boolean);
    const known = new Set(local.map((b) => b.id));
    const marks = remote.marks.filter(
      (m: any) =>
        known.has(m.bookId) &&
        typeof m.id === "string" &&
        typeof m.quote === "string" &&
        typeof m.note === "string" &&
        Number.isFinite(m.updated),
    );
    const sessions = remote.sessions.filter(
      (s: any) =>
        known.has(s.bookId) &&
        typeof s.id === "string" &&
        typeof s.date === "string" &&
        Number.isFinite(s.seconds) &&
        s.seconds >= 0,
    );
    await db.merge(books, marks, sessions);
  } else if (
    response.status !== 404 &&
    !(
      c.provider === "dropbox" &&
      response.status === 409 &&
      (await response.text()).includes("not_found")
    )
  )
    throw Error("Cloud download failed (" + response.status + ").");
  const [books, marks, sessions] = await Promise.all([
    db.books(),
    db.allMarks(),
    db.sessions(),
  ]);
  const payload = JSON.stringify({
    version: 1,
    updated: Date.now(),
    books: books.map(({ id, progress, location, lastRead, finished }) => ({
      id,
      progress,
      location,
      lastRead,
      finished,
    })),
    marks,
    sessions,
  });
  const uploaded = await cloudRequest(c, "PUT", payload);
  if (!uploaded.ok)
    throw Error("Cloud upload failed (" + uploaded.status + ").");
  return true;
}

export async function backupToCloud() {
  const config = await getCloud();
  if (!config) throw Error("Connect WebDAV or Dropbox first.");
  const blob = await backupBlob();
  if (blob.size > 128 * 1024 * 1024)
    throw Error(
      "The full cloud backup exceeds 128 MB. Use a local backup instead.",
    );
  const response = await cloudRequest(config, "PUT", blob, "library.books");
  if (!response.ok)
    throw Error("Cloud backup failed (HTTP " + response.status + ").");
  return blob.size;
}
export async function restoreFromCloud() {
  const config = await getCloud();
  if (!config) throw Error("Connect WebDAV or Dropbox first.");
  const response = await cloudRequest(
    config,
    "GET",
    undefined,
    "library.books",
  );
  if (!response.ok)
    throw Error("Cloud restore failed (HTTP " + response.status + ").");
  return restore(new File([await response.blob()], "library.books"));
}
