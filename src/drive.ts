import { native, isNative } from "./native";
import { db } from "./db";
import { backupBlob, restore } from "./backup";
export interface GoogleUser {
  id: string;
  name: string;
  email: string;
  picture: string;
}
export interface DriveState {
  auto: boolean;
  lastBackup: number;
  size: number;
  fileId: string;
  error: string;
}
export interface DriveBackup {
  id: string;
  name: string;
  modifiedTime: string;
  size: string;
  appProperties?: Record<string, string>;
}
export interface Transfer {
  stage: string;
  percent: number;
}
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,modifiedTime";
let active = false;
export const driveBusy = () => active;
export const googleProfile = async (): Promise<GoogleUser | null> =>
  isNative() ? native("googleProfile") : null;
export async function googleAvailability(): Promise<{configured: boolean; android: boolean}> {
  if (!isNative()) return { configured: false, android: false };
  const status = await native("googleStatus");
  return { configured: status?.configured === true, android: true };
}
export const googleSignIn = async (): Promise<GoogleUser> =>
  native("googleSignIn");
export async function googleSignOut() {
  if (active) throw Error("Wait for the current backup to finish.");
  await native("googleSignOut");
}
export async function driveState(
  user?: GoogleUser | null,
): Promise<DriveState> {
  const account = user ?? (await googleProfile());
  return {
    auto: false,
    lastBackup: 0,
    size: 0,
    fileId: "",
    error: "",
    ...(account ? await db.preference<DriveState>("drive:" + account.id) : {}),
  };
}
export async function saveDriveState(
  value: Partial<DriveState>,
  user: GoogleUser,
) {
  await db.savePreference("drive:" + user.id, {
    ...(await driveState(user)),
    ...value,
  });
}
async function request(
  url: string,
  method = "GET",
  body?: Blob | string,
  headers: Record<string, string> = {},
) {
  let bodyBase64: string | undefined;
  if (body instanceof Blob) {
    const bytes = new Uint8Array(await body.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    bodyBase64 = btoa(binary);
  }
  const result = await native("googleHttp", {
    url,
    method,
    headers,
    body: typeof body === "string" ? body : undefined,
    bodyBase64,
  });
  const response = new Response(
    [204, 205, 304].includes(result.status)
      ? null
      : Uint8Array.from(atob(result.body), (c) => c.charCodeAt(0)),
    { status: result.status, headers: result.headers },
  );
  if (response.status === 401)
    throw Error(
      "Your Google session expired. Tap Backup now or Restore to reconnect.",
    );
  if (response.status === 403)
    throw Error(
      "Google Drive denied this request. Check Drive permission and available storage, then retry.",
    );
  if (!response.ok && response.status !== 308)
    throw Error(
      `Google Drive could not complete this request (${response.status}). Your local books are safe.`,
    );
  return response;
}
async function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (active) throw Error("A backup or restore is already running.");
  active = true;
  window.dispatchEvent(new Event("drive:busy"));
  try {
    return await work();
  } finally {
    active = false;
    window.dispatchEvent(new Event("drive:busy"));
  }
}
export async function listDriveBackups(): Promise<DriveBackup[]> {
  return exclusive(async () => {
    await native("googleAuthorize", { interactive: true });
    const query = new URLSearchParams({
      spaces: "appDataFolder",
      q: "trashed = false and appProperties has { key='booksBackup' and value='1' }",
      fields: "nextPageToken,files(id,name,size,modifiedTime,appProperties)",
      orderBy: "modifiedTime desc",
      pageSize: "100",
    });
    const all: DriveBackup[] = [];
    let token = "";
    do {
      if (token) query.set("pageToken", token);
      const data = await (await request(API + "?" + query)).json();
      all.push(...data.files);
      token = data.nextPageToken ?? "";
    } while (token && all.length < 1000);
    return all;
  });
}
export async function backupToDrive(
  onProgress: (p: Transfer) => void = () => {},
  interactive = true,
) {
  return exclusive(async () => {
    const user = await googleProfile();
    if (!user) throw Error("Sign in with Google first.");
    try {
      await native("googleAuthorize", { interactive });
      onProgress({
        stage: "Preparing your books, notes and settings…",
        percent: 0,
      });
      const blob = await backupBlob();
      const snapshot = await db.snapshot();
      const metadata = {
        name:
          "Books " + new Date().toISOString().replace(/[:.]/g, "-") + ".books",
        parents: ["appDataFolder"],
        mimeType: "application/zip",
        appProperties: {
          booksBackup: "1",
          books: String(snapshot.books.length),
          notes: String(snapshot.marks.filter((m) => !m.deleted).length),
          sessions: String(snapshot.sessions.length),
        },
      };
      const started = await request(UPLOAD, "POST", JSON.stringify(metadata), {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/zip",
        "X-Upload-Content-Length": String(blob.size),
      });
      const location = started.headers.get("Location");
      if (
        !location ||
        new URL(location).origin !== "https://www.googleapis.com" ||
        !new URL(location).pathname.startsWith("/upload/drive/v3/")
      )
        throw Error("Google did not return a valid upload address.");
      let finished: { id: string; size?: string } | undefined;
      const chunk = 1024 * 1024;
      for (let offset = 0; offset < blob.size; offset += chunk) {
        const end = Math.min(offset + chunk, blob.size);
        const response = await request(
          location,
          "PUT",
          blob.slice(offset, end),
          {
            "Content-Type": "application/zip",
            "Content-Range": `bytes ${offset}-${end - 1}/${blob.size}`,
          },
        );
        if (end < blob.size && response.status !== 308)
          throw Error(
            "Drive ended the upload before all books were sent. Try again.",
          );
        if (end === blob.size) {
          if (response.status === 308)
            throw Error(
              "Drive has not finished saving this backup. Try again.",
            );
          finished = await response.json();
        }
        onProgress({
          stage: "Saving to your Google Drive…",
          percent: Math.round((end / blob.size) * 100),
        });
      }
      if (!finished?.id || Number(finished.size) !== blob.size)
        throw Error(
          "Drive could not confirm the complete backup. Please retry.",
        );
      await saveDriveState(
        {
          lastBackup: Date.now(),
          size: blob.size,
          fileId: finished.id,
          error: "",
        },
        user,
      );
      return blob.size;
    } catch (error) {
      await saveDriveState({ error: (error as Error).message }, user);
      throw error;
    }
  });
}
export async function restoreDriveBackup(
  backup: DriveBackup,
  onProgress: (p: Transfer) => void = () => {},
) {
  return exclusive(async () => {
    await native("googleAuthorize", { interactive: true });
    // Re-read size and metadata rather than trusting a stale list entry.
    const metadata = await (
      await request(
        API +
          "/" +
          encodeURIComponent(backup.id) +
          "?fields=id,size,appProperties",
      )
    ).json();
    const size = Number(metadata.size);
    if (
      metadata.appProperties?.booksBackup !== "1" ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > 512 * 1024 * 1024
    )
      throw Error("This backup is not supported or exceeds 512 MB.");
    const chunks: Blob[] = [];
    const step = 4 * 1024 * 1024;
    for (let offset = 0; offset < size; offset += step) {
      const end = Math.min(offset + step, size);
      const response = await request(
        API + "/" + encodeURIComponent(backup.id) + "?alt=media",
        "GET",
        undefined,
        { Range: `bytes=${offset}-${end - 1}` },
      );
      const bytes = await response.blob();
      if (bytes.size !== end - offset)
        throw Error(
          "The backup download was incomplete. Nothing was restored.",
        );
      chunks.push(bytes);
      onProgress({
        stage: "Downloading your backup…",
        percent: Math.round((end / size) * 100),
      });
    }
    onProgress({ stage: "Checking and restoring your library…", percent: 100 });
    return restore(new File(chunks, "Drive-backup.books"));
  });
}
export async function deleteDriveBackup(backup: DriveBackup) {
  return exclusive(async () => {
    await native("googleAuthorize", { interactive: true });
    const metadata = await (
      await request(
        API + "/" + encodeURIComponent(backup.id) + "?fields=id,appProperties",
      )
    ).json();
    if (metadata.appProperties?.booksBackup !== "1")
      throw Error("This is not a Books backup.");
    await request(API + "/" + encodeURIComponent(backup.id), "DELETE");
  });
}
export async function maybeAutoBackup() {
  if (active || !navigator.onLine) return;
  const user = await googleProfile();
  if (!user) return;
  const state = await driveState(user);
  // Full snapshots run only after leaving the reader, at most once per hour.
  if (!state.auto || Date.now() - state.lastBackup < 3600000) return;
  await backupToDrive(undefined, false);
}
