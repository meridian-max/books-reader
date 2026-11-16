import { openDB } from "idb";
import {
  defaults,
  type Book,
  type Mark,
  type Session,
  type Settings,
} from "./types";
const dbp = openDB("books-reader", 1, {
  upgrade(db) {
    db.createObjectStore("books", { keyPath: "id" });
    db.createObjectStore("marks", { keyPath: "id" });
    db.createObjectStore("sessions", { keyPath: "id" });
    db.createObjectStore("settings");
  },
});
export const db = {
  snapshot: async () => {
    const tx = (await dbp).transaction([
      "books",
      "marks",
      "sessions",
      "settings",
    ]);
    const [books, marks, sessions, saved, profile] = await Promise.all([
      tx.objectStore("books").getAll(),
      tx.objectStore("marks").getAll(),
      tx.objectStore("sessions").getAll(),
      tx.objectStore("settings").get("reader"),
      tx.objectStore("settings").get("profile"),
    ]);
    await tx.done;
    return {
      books: books as Book[],
      marks: marks as Mark[],
      sessions: sessions as Session[],
      settings: { ...defaults, ...saved } as Settings,
      profile,
    };
  },
  preference: async <T>(key: string): Promise<T | undefined> =>
    (await dbp).get("settings", key),
  savePreference: async (key: string, value: unknown) => {
    await (await dbp).put("settings", value, key);
  },
  books: async () => (await (await dbp).getAll("books")) as Book[],
  book: async (id: string) =>
    (await (await dbp).get("books", id)) as Book | undefined,
  putBook: async (b: Book) => {
    await (await dbp).put("books", b);
  },
  removeBook: async (id: string) => {
    const d = await dbp;
    const tx = d.transaction(["books", "marks", "sessions"], "readwrite");
    await tx.objectStore("books").delete(id);
    for (const store of ["marks", "sessions"])
      for (const x of await tx.objectStore(store).getAll())
        if (x.bookId === id) await tx.objectStore(store).delete(x.id);
    await tx.done;
  },
  marks: async (bookId?: string) =>
    ((await (await dbp).getAll("marks")) as Mark[]).filter(
      (m) => !m.deleted && (!bookId || m.bookId === bookId),
    ),
  allMarks: async () => (await (await dbp).getAll("marks")) as Mark[],
  putMark: async (m: Mark) => {
    await (await dbp).put("marks", m);
  },
  deleteMark: async (id: string) => {
    const d = await dbp;
    const m = await d.get("marks", id);
    if (m) await d.put("marks", { ...m, deleted: true, updated: Date.now() });
  },
  sessions: async () => (await (await dbp).getAll("sessions")) as Session[],
  putSession: async (s: Session) => {
    await (await dbp).put("sessions", s);
  },
  settings: async () => {
    const d = await dbp;
    const tx = d.transaction("settings", "readwrite");
    const saved = await tx.store.get("reader");
    const settings = {
      ...defaults,
      ...saved,
      eventActions: { ...defaults.eventActions, ...saved?.eventActions },
      hardwareKeys: { ...saved?.hardwareKeys },
      marginLeft: saved?.marginLeft ?? saved?.margin ?? defaults.margin,
      marginRight: saved?.marginRight ?? saved?.margin ?? defaults.margin,
      marginTop: saved?.marginTop ?? saved?.margin ?? defaults.margin,
      marginBottom: saved?.marginBottom ?? saved?.margin ?? defaults.margin,
      shakeAction: saved?.shakeAction ?? (saved?.shakeTTS ? "speech" : "none"),
    } as Settings;
    if(!saved?.controlsVersion){if(settings.eventActions.longPress==='none')settings.eventActions.longPress='select-text';settings.controlsVersion=1;}
    // This release enables the requested up/down reading for existing
    // installations too. Record it once; subsequent explicit page-mode
    // choices must survive reopening, restart, and backup/restore.
    if (!(Number(saved?.readingModeVersion) >= 1)) {
      settings.flow = "scrolled";
      settings.readingModeVersion = 1;
      await tx.store.put(settings, "reader");
    }
    await tx.done;
    return settings;
  },
  saveSettings: async (s: Settings) => {
    await (await dbp).put("settings", s, "reader");
  },
  merge: async (
    books: Book[],
    marks: Mark[],
    sessions: Session[],
    preferences?: { settings?: Settings; profile?: unknown },
  ) => {
    const d = await dbp;
    const tx = d.transaction(
      ["books", "marks", "sessions", "settings"],
      "readwrite",
    );
    for (const b of books) {
      const old = await tx.objectStore("books").get(b.id);
      if (!old || b.lastRead > old.lastRead)
        await tx.objectStore("books").put(b);
    }
    for (const m of marks) {
      const old = await tx.objectStore("marks").get(m.id);
      if (!old || (m.updated ?? m.created) > (old.updated ?? old.created))
        await tx.objectStore("marks").put(m);
    }
    for (const s of sessions) {
      const old = await tx.objectStore("sessions").get(s.id);
      if (!old || s.seconds > old.seconds)
        await tx.objectStore("sessions").put(s);
    }
    if (preferences?.settings)
      await tx.objectStore("settings").put(preferences.settings, "reader");
    if (preferences?.profile)
      await tx.objectStore("settings").put(preferences.profile, "profile");
    await tx.done;
  },
};
