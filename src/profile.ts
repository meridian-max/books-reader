import { db } from "./db";
import { escapeHTML as E, type Book, type Settings } from "./types";
import { icon, modal, closeModal, confirmDialog, toast, range } from "./ui";
import {
  avatars,
  getProfile,
  saveProfile,
  readingSummary,
} from "./profile-data";
import {
  googleProfile,
  googleAvailability,
  googleSignIn,
  googleSignOut,
  driveState,
  saveDriveState,
  backupToDrive,
  listDriveBackups,
  restoreDriveBackup,
  deleteDriveBackup,
  driveBusy,
  type Transfer,
} from "./drive";
import { celebrate } from "./motion";
const prettySize = (size: number) =>
  size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
const stamp = (value: string | number) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
// Google's multicolour G is kept intact on a plain, high-contrast sign-in button.
const googleIcon =
  '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.8-3.5 6.1-8.6 6.1-14.9Z"/><path fill="#34A853" d="M24 44c5.4 0 9.9-1.8 13.2-4.8l-6.6-5a12 12 0 0 1-17.9-6.3H6v5.2A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.7 27.9a12 12 0 0 1 0-7.8v-5.2H6a20 20 0 0 0 0 18.2l6.7-5.2Z"/><path fill="#EA4335" d="M24 12c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 6 14.9l6.7 5.2A12 12 0 0 1 24 12Z"/></svg>';
export async function renderProfile(
  page: HTMLElement,
  books: Book[],
  settings: Settings,
  refresh: () => Promise<void>,
) {
  const [profile, user, sessions, marks, google] = await Promise.all([
    getProfile(),
    googleProfile(),
    db.sessions(),
    db.marks(),
    googleAvailability(),
  ]);
  if (!page.isConnected) return;
  const summary = readingSummary(sessions),
    state = await driveState(user);
  const name = profile.name || user?.name || "Reader";
  const pct = Math.min(100, (summary.today / (settings.dailyGoal * 60)) * 100);
  const finished = books.filter((b) => b.finished).length;
  page.classList.add("profile-page");
  page.innerHTML = `<div class="profile-heading"><span class="profile-label">Profile</span><button class="icon-button" data-shortcut="settings" aria-label="Settings">${icon("settings", 22)}</button></div>
  <section class="reader-pass"><div class="pass-label"><span>Reading profile</span>${icon("book", 21)}</div><section class="profile-identity"><button class="reader-avatar large" data-profile="edit" aria-label="Edit profile">${icon(profile.avatar, 35)}<i>${icon("pencil", 12)}</i></button><div><h1>${E(name)}</h1><p>${user ? E(user.email) : "On this device"}</p><button class="subtle" data-profile="edit">Edit profile ${icon("pencil", 14)}</button></div></section>
  <div class="profile-metrics"><div>${icon("book", 20)}<strong>${finished}</strong><small>books finished</small></div><div>${icon("clock", 20)}<strong>${Math.floor(summary.total / 3600)}h ${Math.floor((summary.total % 3600) / 60)}m</strong><small>time reading</small></div><div>${icon("flame", 20)}<strong>${summary.streak}</strong><small>day streak</small></div></div></section>
  <section class="habit-card"><div class="habit-heading"><div><h2>Reading goal</h2></div><button class="subtle" data-action="daily-goal">${settings.dailyGoal} min goal ${icon("pencil", 14)}</button></div><div class="habit-progress"><div><strong>${Math.floor(summary.today / 60)}</strong><span> / ${settings.dailyGoal} min today</span></div><span>${Math.round(pct)}%</span></div><div class="habit-track"><span style="--fill:${pct}%"></span></div><div class="habit-week">${summary.week.map((day) => `<div class="${day.seconds >= 60 ? "done" : ""}"><span aria-label="${E(day.date)}: ${Math.floor(day.seconds / 60)} minutes">${day.seconds >= 60 ? icon("check", 17) : "<i></i>"}</span><small>${E(day.label)}</small></div>`).join("")}</div><button class="subtle" data-shortcut="statistics">Reading statistics ${icon("chevron", 16)}</button></section>
  <section class="drive-card"><div class="drive-heading"><h2>${icon("cloud", 22)} Backup & restore</h2><p>Keep your books, notes, settings and reading history together.</p></div>
  ${user ? `<div class="drive-account">${googleIcon}<span>${E(user.email)}</span><span class="chip">Signed in</span></div><p class="backup-status">${state.lastBackup ? `Last backup · ${E(stamp(state.lastBackup))}<br>${prettySize(state.size)}` : "No backup from this device yet."}</p>${state.error ? `<p class="cloud-error" role="status">${E(state.error)}</p>` : ""}<div class="cloud-buttons"><button class="primary" data-profile="backup">${icon("upload", 18)} Backup now</button><button class="secondary" data-profile="restore">${icon("download", 18)} Restore</button></div><details class="backup-options"><summary>Backup options & details</summary><label class="auto-backup-row"><span><strong>Back up after reading</strong><small>When online, at most once an hour.</small></span><input type="checkbox" id="drive-auto" ${state.auto ? "checked" : ""} aria-label="Back up after reading"></label><p class="small">Each backup is a complete snapshot kept in your private Books folder on Drive. It uses your Drive storage; manage old snapshots under Restore. Restore brings back your library and preferences; newer local reading progress is kept. Libraries up to 480 MB are supported. Passwords and connected-account credentials stay on this device.</p></details><button class="subtle" data-profile="signout">${icon("logout", 16)} Sign out</button>` : google.configured ? `<button class="google-signin" data-profile="signin">${googleIcon} Sign in with Google</button><p class="cloud-footnote">Use your own Google Drive for backups. Reading works without an account.</p>` : `<div class="google-unavailable" role="status"><strong>${google.android ? "Google sign-in setup incomplete" : "Google sign-in requires the Android app"}</strong><p>${google.android ? "Google Drive isn't available in this build. You can save and restore a backup file below." : "You can still save your library as a backup file."}</p></div>`}
  <div class="local-backup-actions"><button class="subtle" data-action="backup">${icon("download", 18)} Save backup file</button><button class="subtle" data-action="restore">${icon("upload", 18)} Restore from file</button></div><div class="transfer-status" role="status" aria-live="polite" hidden><span></span><progress max="100" value="0"></progress></div></section>
  <div class="profile-links"><button data-shortcut="history"><span class="quick-icon">${icon("clock", 22)}</span><span><strong>Reading history</strong><small>Books opened and time spent reading</small></span>${icon("chevron", 19)}</button><button data-shortcut="settings"><span class="quick-icon">${icon("settings", 22)}</span><span><strong>Settings</strong><small>Reading, appearance and connections</small></span>${icon("chevron", 19)}</button></div>
  <details class="milestones"><summary>Reading milestones ${icon("down", 18)}</summary><div class="badge-rail">${[
    ["book", "First session", summary.total >= 60],
    ["highlight", "First highlight", marks.some((m) => m.type === "highlight")],
    ["flame", "3-day streak", summary.streak >= 3],
    ["trophy", "Book finished", finished >= 1],
  ]
    .map(
      ([ic, label, done]) =>
        `<div class="achievement ${done ? "earned" : ""}"><span>${icon(String(ic), 25)}</span><strong>${label}</strong><small>${done ? "Completed" : "Not yet"}</small></div>`,
    )
    .join("")}</div></details>`;
  page.querySelector('.reader-pass')!.after(page.querySelector('.profile-links')!);
  page.querySelector('.profile-links')!.after(page.querySelector('.drive-card')!);
  const busy = (value: boolean) => {
    page
      .querySelectorAll<
        HTMLButtonElement | HTMLInputElement
      >("[data-profile],#drive-auto")
      .forEach((button) => (button.disabled = value));
    page.querySelector(".drive-card")?.setAttribute("aria-busy", String(value));
  };
  busy(driveBusy());
  const progress = (value: Transfer) => {
    const box = page.querySelector<HTMLElement>(".transfer-status");
    if (!box) return;
    box.hidden = false;
    box.querySelector("span")!.textContent = value.stage;
    box.querySelector("progress")!.value = value.percent;
  };
  page.querySelector("#drive-auto")?.addEventListener("change", async (e) => {
    if (!user) return;
    const input = e.target as HTMLInputElement;
    await saveDriveState({ auto: input.checked }, user);
    toast(
      input.checked
        ? "Automatic backups are on after reading."
        : "Automatic backups paused.",
    );
  });
  page.querySelectorAll<HTMLButtonElement>("[data-profile]").forEach((button) =>
    button.addEventListener("click", async () => {
      const action = button.dataset.profile;
      try {
        if (action === "edit") {
          let avatar = profile.avatar;
          const dialog = modal(
            "Edit profile",
            `<form id="profile-form"><label class="field">Name<input name="name" maxlength="60" autocomplete="nickname" value="${E(profile.name)}" placeholder="Your name"></label><span class="field-label">Profile icon</span><div class="avatar-options">${avatars.map((a) => `<button type="button" data-avatar="${a}" class="reader-avatar ${a === avatar ? "selected" : ""}" aria-label="${a}" aria-pressed="${a === avatar}">${icon(a, 27)}</button>`).join("")}</div><button class="primary full-width" type="submit">Save profile ${icon("check", 18)}</button></form>`,
          );
          dialog.querySelectorAll<HTMLButtonElement>("[data-avatar]").forEach(
            (b) =>
              (b.onclick = () => {
                avatar = b.dataset.avatar!;
                dialog.querySelectorAll("[data-avatar]").forEach((el) => {
                  el.classList.toggle("selected", el === b);
                  el.setAttribute("aria-pressed", String(el === b));
                });
              }),
          );
          dialog.querySelector("form")!.onsubmit = async (e) => {
            e.preventDefault();
            await saveProfile({
              ...profile,
              name: new FormData(e.target as HTMLFormElement).get(
                "name",
              ) as string,
              avatar,
            });
            closeModal();
            await refresh();
            toast("Your profile is saved.");
          };
          return;
        }
        busy(true);
        if (action === "signin") {
          await googleSignIn();
          await refresh();
          toast("Signed in. Your library is ready.");
        } else if (action === "signout") {
          if (
            !(await confirmDialog(
              "Sign out of Google?",
              "Your downloaded books, notes and reading history stay on this device. Backups in your Google Drive stay there too.",
              "Sign out",
            ))
          )
            return;
          await googleSignOut();
          await refresh();
        } else if (action === "backup") {
          await backupToDrive(progress);
          await refresh();
          celebrate(document.querySelector(".drive-card") as HTMLElement);
          toast("Your complete library is saved to Google Drive.");
        } else if (action === "restore") {
          progress({ stage: "Finding your backups…", percent: 0 });
          const backups = await listDriveBackups();
          const dialog = modal(
            "Restore from Google Drive",
            `<p class="small">Choose a backup. Books, highlights and history are merged with this device. Your saved settings and profile preferences will be restored.</p><div class="backup-list">${backups.map((b, i) => `<div class="backup-item"><button class="backup-choice" data-backup="${i}">${icon("cloud", 24)}<span><strong>${E(stamp(b.modifiedTime))}</strong><small>${E(b.appProperties?.books ?? "?")} books · ${prettySize(Number(b.size))}</small></span>${icon("chevron", 19)}</button><button class="icon-button" data-delete-backup="${i}" aria-label="Delete backup from ${E(stamp(b.modifiedTime))}">${icon("trash", 18)}</button></div>`).join("") || '<p class="empty-small">No Books backups in this Google account yet. Back up from your other device first.</p>'}</div>`,
          );
          dialog
            .querySelectorAll<HTMLButtonElement>("[data-delete-backup]")
            .forEach(
              (b) =>
                (b.onclick = async () => {
                  const backup = backups[Number(b.dataset.deleteBackup)];
                  if (
                    !(await confirmDialog(
                      "Delete this Drive backup?",
                      `Permanently delete the snapshot from ${stamp(backup.modifiedTime)}? Your local library and other Drive backups stay unchanged.`,
                      "Delete backup",
                    ))
                  )
                    return;
                  busy(true);
                  try {
                    await deleteDriveBackup(backup);
                    toast("Backup removed from Google Drive.");
                  } catch (error) {
                    toast((error as Error).message, true);
                  } finally {
                    busy(false);
                  }
                }),
            );
          dialog.querySelectorAll<HTMLButtonElement>("[data-backup]").forEach(
            (b) =>
              (b.onclick = async () => {
                const backup = backups[Number(b.dataset.backup)];
                if (
                  !(await confirmDialog(
                    "Restore this backup?",
                    `Restore the library and settings from ${stamp(backup.modifiedTime)}? Your existing books remain and newer local reading positions are kept.`,
                    "Restore library",
                  ))
                )
                  return;
                busy(true);
                try {
                  const count = await restoreDriveBackup(backup, progress);
                  await refresh();
                  toast(
                    `${count} books restored with notes, history and settings.`,
                  );
                } catch (error) {
                  toast((error as Error).message, true);
                } finally {
                  busy(false);
                  const box =
                    page.querySelector<HTMLElement>(".transfer-status");
                  if (box) box.hidden = true;
                }
              }),
          );
        }
      } catch (error) {
        toast((error as Error).message, true);
      } finally {
        busy(false);
        const box = page.querySelector<HTMLElement>(".transfer-status");
        if (box) box.hidden = true;
      }
    }),
  );
}
export async function renderHistory(page: HTMLElement, books: Book[]) {
  const sessions = await db.sessions();
  const byDate = new Map<string, Map<string, number>>();
  for (const session of sessions) {
    const day = byDate.get(session.date) ?? new Map<string, number>();
    day.set(session.bookId, (day.get(session.bookId) ?? 0) + session.seconds);
    byDate.set(session.date, day);
  }
  const dates = [...byDate.keys()].sort().reverse();
  const bookMap = new Map(books.map((book) => [book.id, book]));
  page.classList.add("history-page");
  page.innerHTML = `<div class="page-heading"><div><span class="eyebrow">ONE CHAPTER AT A TIME</span><h1>Reading history</h1><p>All those small moments, saved.</p></div></div><label class="settings-search">${icon("search", 20)}<input type="search" id="history-search" placeholder="Find a book in your history" aria-label="Search reading history"></label><div id="history-list"></div>`;
  const render = (query = "") => {
    const output = page.querySelector("#history-list")!;
    const blocks: string[] = [];
    let shown = 0;
    for (const date of dates) {
      const rows = [...byDate.get(date)!]
        .map(([id, seconds]) => ({ book: bookMap.get(id)!, seconds }))
        .filter(
          (x) =>
            x.book &&
            x.seconds > 0 &&
            `${x.book.title} ${x.book.author}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        );
      if (!rows.length) continue;
      if (shown >= 100) {
        blocks.push(
          '<p class="small">Showing the latest 100 reading days. Search for a book to see its older history.</p>',
        );
        break;
      }
      shown++;
      blocks.push(
        `<section class="history-day"><h2>${E(new Date(date + "T12:00:00").toLocaleDateString(undefined, { dateStyle: "long" }))}</h2>${rows.map(({ book, seconds }) => `<button class="history-row" data-open="${book.id}"><span class="quick-icon">${icon("book", 22)}</span><span><strong>${E(book.title)}</strong><small>${E(book.author)} · ${seconds < 60 ? "Less than a minute" : Math.floor(seconds / 60) + " min"}</small></span>${icon("arrow", 18)}</button>`).join("")}</section>`,
      );
    }
    output.innerHTML =
      blocks.join("") ||
      `<div class="empty-state">${icon("clock", 38)}<h3>${query ? "No matching history" : "No reading history yet"}</h3><p>${query ? "Try another title or author." : "Read a book and your sessions will appear here."}</p></div>`;
  };
  render();
  page
    .querySelector("input")!
    .addEventListener("input", (e) =>
      render((e.target as HTMLInputElement).value),
    );
}
