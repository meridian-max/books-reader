import { db } from './db';
import { escapeHTML as E, type Book, type Mark } from './types';
import { icon, inputDialog, toast } from './ui';
import { reducedMotion } from './motion';

export function markLabel(mark: Mark) {
  if (mark.type === 'bookmark') return 'Page bookmark';
  if (mark.type === 'note') return 'Note';
  return ({ Underline: 'Underline', StrikeOut: 'Strikethrough', Squiggly: 'Wavy underline' } as Record<string, string>)[mark.style ?? ''] ?? 'Highlight';
}
export function passage(mark: Mark, compact = false) {
  const style = ['Underline', 'StrikeOut', 'Squiggly'].includes(mark.style ?? '') ? mark.style! : 'Highlight';
  const color = /^#[0-9a-f]{3,8}$/i.test(mark.color) ? mark.color : '#d5c4a1';
  return `<blockquote class="saved-passage ${compact ? 'compact-passage' : ''}" data-ink="${style}" style="--saved-ink:${color}"><span>${E(mark.quote || 'A bookmarked page')}</span></blockquote>`;
}
type OpenPassage = (mark: Mark) => Promise<void>;

// A fixed, recent selection; no timers, tracking, or automatic rotation.
export function mountMargins(root: HTMLElement, marks: Mark[], books: Book[], cover: (b: Book) => string, open: OpenPassage) {
  const byBook = new Map(books.map(b => [b.id, b]));
  const saved = marks.filter(m => m.quote.trim() && byBook.has(m.bookId)).sort((a, b) => b.created - a.created).slice(0, 5);
  if (!saved.length) { root.remove(); return; }
  let index = 0;
  root.innerHTML = `<div class="home-section-heading"><h2>From your margins</h2><button class="subtle" data-shortcut="notebook">All notes ${icon('chevron', 15)}</button></div><div class="margin-leaf"><div class="margin-content"></div><div class="margin-controls"><span class="margin-position" aria-live="polite" aria-atomic="true"></span><div><button class="icon-button" data-margin-step="-1" aria-label="Previous saved passage">${icon('back', 20)}</button><button class="icon-button" data-margin-step="1" aria-label="Next saved passage">${icon('arrow', 20)}</button></div></div></div>`;
  const content = root.querySelector<HTMLElement>('.margin-content')!;
  function draw(direction = 0) {
    const mark = saved[index], book = byBook.get(mark.bookId)!;
    content.innerHTML = `<div class="saved-kind">${icon(mark.type === 'bookmark' ? 'bookmark' : mark.type === 'note' ? 'pencil' : 'highlight', 16)} ${markLabel(mark)}</div>${passage(mark, true)}<button class="passage-source" data-margin-open aria-label="Open saved passage in ${E(book.title)}"><img src="${E(cover(book))}" width="36" height="52" alt="" loading="lazy" decoding="async"><span><strong>${E(book.title)}</strong><small>${E(book.author)}</small></span>${icon('arrow', 18)}</button>`;
    root.querySelector('.margin-position')!.textContent = `${index + 1} of ${saved.length} saved passages`;
    root.querySelector<HTMLButtonElement>('[data-margin-step="-1"]')!.disabled = index === 0;
    root.querySelector<HTMLButtonElement>('[data-margin-step="1"]')!.disabled = index === saved.length - 1;
    content.querySelector<HTMLButtonElement>('[data-margin-open]')!.onclick = () => void open(mark).catch(error => toast(error.message, true));
    if (direction && !reducedMotion()) {
      content.getAnimations().forEach(animation => animation.cancel());
      content.animate([{ opacity: .5, translate: `${direction * 12}px 0` }, { opacity: 1, translate: '0 0' }], { duration: 160, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
  }
  root.querySelectorAll<HTMLButtonElement>('[data-margin-step]').forEach(button => button.onclick = () => {
    const direction = Number(button.dataset.marginStep);
    index = Math.max(0, Math.min(saved.length - 1, index + direction)); draw(direction);
  });
  draw();
}

const journalState = { query: '', book: '', kind: 'all', limit: 24 };
export function filterJournalByBook(id: string) {
  Object.assign(journalState, { query: '', book: id, kind: 'all', limit: 24 });
}

export async function renderJournal(page: HTMLElement, books: Book[], cover: (b: Book) => string, open: OpenPassage) {
  let marks = (await db.marks()).sort((a, b) => b.created - a.created);
  if (!page.isConnected) return;
  const byBook = new Map(books.map(b => [b.id, b]));
  const bookIds = new Set(marks.map(m => m.bookId));
  if (!bookIds.has(journalState.book)) journalState.book = '';
  page.classList.add('journal-page');
  page.innerHTML = `<div class="journal-heading"><h1>Words worth keeping.</h1><p>Your highlights, notes and bookmarked pages, together.</p><button class="subtle" data-action="export-notes">${icon('download', 18)} Export notes</button></div><div class="journal-tools"><label class="journal-search">${icon('search', 20)}<input type="search" placeholder="Search words, notes or books" aria-label="Search saved passages" value="${E(journalState.query)}"></label><label class="journal-book-filter"><span>From</span><select aria-label="Filter notes by book"><option value="">All books</option>${books.filter(b => bookIds.has(b.id)).sort((a,b)=>a.title.localeCompare(b.title)).map(b => `<option value="${E(b.id)}" ${b.id === journalState.book ? 'selected' : ''}>${E(b.title)}</option>`).join('')}</select></label></div><div class="journal-filters" role="group" aria-label="Saved item type">${[['all','Everything'],['highlight','Highlights'],['note','Notes'],['bookmark','Pages']].map(([key,label])=>`<button data-journal-kind="${key}" aria-pressed="${journalState.kind === key}">${label}</button>`).join('')}</div><p class="journal-count" role="status"></p><div class="journal-list"></div><button class="secondary journal-more" hidden>Show more saved items</button>`;
  const out = page.querySelector<HTMLElement>('.journal-list')!;
  const more = page.querySelector<HTMLButtonElement>('.journal-more')!;
  function matches() {
    const query = journalState.query.toLocaleLowerCase().trim();
    return marks.filter(m => (!journalState.book || m.bookId === journalState.book) && (journalState.kind === 'all' || (journalState.kind === 'note' ? !!m.note || m.type === 'note' : m.type === journalState.kind)) && (!query || `${m.quote} ${m.note} ${byBook.get(m.bookId)?.title ?? ''} ${byBook.get(m.bookId)?.author ?? ''} ${markLabel(m)}`.toLocaleLowerCase().includes(query)));
  }
  function card(mark: Mark) {
    const book = byBook.get(mark.bookId);
    return `<article class="journal-entry" data-mark-id="${E(mark.id)}"><div class="journal-entry-meta"><span class="saved-kind">${icon(mark.type === 'bookmark' ? 'bookmark' : mark.type === 'note' ? 'pencil' : 'highlight',16)}${markLabel(mark)}</span><time datetime="${new Date(mark.created).toISOString()}">${new Date(mark.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></div>${passage(mark)}${mark.note ? `<p class="journal-thought">${icon('pencil',14)}<span>${E(mark.note)}</span></p>` : ''}<div class="journal-entry-footer"><button class="passage-source" data-note-open="${E(mark.id)}" ${book ? '' : 'disabled'} aria-label="Open passage in ${E(book?.title ?? 'unavailable book')}">${book ? `<img src="${E(cover(book))}" width="36" height="52" alt="" loading="lazy" decoding="async">` : ''}<span><strong>${E(book?.title ?? 'Book not on this device')}</strong><small>${E(book?.author ?? 'Restore the book to open this passage')}</small></span>${icon('arrow',18)}</button><button class="icon-button" data-note-edit="${E(mark.id)}" aria-label="Edit note">${icon('pencil',18)}</button><button class="icon-button" data-note-remove="${E(mark.id)}" aria-label="Remove saved item">${icon('trash',18)}</button></div></article>`;
  }
  function draw(append = false) {
    const items = matches(), start = append ? out.children.length : 0;
    const count = page.querySelector('.journal-count')!;
    count.textContent = `${items.length} saved ${items.length === 1 ? 'item' : 'items'}${journalState.query ? ' found' : ''}`;
    if (!append) out.replaceChildren();
    if (items.length) out.insertAdjacentHTML('beforeend', items.slice(start, journalState.limit).map(card).join(''));
    else out.innerHTML = `<div class="journal-empty">${icon(marks.length ? 'search' : 'notebook',36)}<h2>${marks.length ? 'No matching passages' : 'Keep a little of every book.'}</h2><p>${marks.length ? 'Try another word, book or saved item type.' : 'Select words while reading to highlight or add a note. Saved pages appear here too.'}</p><button class="secondary" ${marks.length ? 'data-journal-reset' : 'data-nav="library"'}>${marks.length ? 'Clear filters' : 'Open your library'}</button></div>`;
    more.hidden = items.length <= journalState.limit;
  }
  const resetBatch = () => { journalState.limit = 24; draw(); };
  page.querySelector<HTMLInputElement>('.journal-search input')!.oninput = event => {
    journalState.query = (event.target as HTMLInputElement).value; resetBatch();
  };
  page.querySelector<HTMLSelectElement>('.journal-book-filter select')!.onchange = event => {
    journalState.book = (event.target as HTMLSelectElement).value; resetBatch();
  };
  more.onclick = () => { journalState.limit += 24; draw(true); };
  page.addEventListener('click', async event => {
    const target = (event.target as Element).closest<HTMLElement>('button');
    if (!target) return;
    try {
      if (target.dataset.journalKind) {
        journalState.kind = target.dataset.journalKind;
        page.querySelectorAll<HTMLElement>('[data-journal-kind]').forEach(b => b.setAttribute('aria-pressed', String(b === target)));
        resetBatch();
      } else if (target.hasAttribute('data-journal-reset')) {
        Object.assign(journalState, { query: '', book: '', kind: 'all', limit: 24 });
        await renderJournal(page, books, cover, open);
      } else if (target.dataset.noteOpen) {
        const mark = marks.find(m => m.id === target.dataset.noteOpen); if (mark) await open(mark);
      } else if (target.dataset.noteEdit) {
        const mark = marks.find(m => m.id === target.dataset.noteEdit); if (!mark) return;
        const note = await inputDialog('Edit note', 'Your thoughts', mark.note, 'text', true);
        if (note === null) return;
        mark.note = note; mark.updated = Date.now(); await db.putMark(mark);
        draw(); toast(note ? 'Note saved.' : 'Note cleared.');
      } else if (target.dataset.noteRemove) {
        await db.deleteMark(target.dataset.noteRemove); marks = marks.filter(m => m.id !== target.dataset.noteRemove);
        draw(); toast('Saved item removed.');
      }
    } catch (error) { toast((error as Error).message, true); }
  }, { signal: replaceListener(page) });
  draw();
}

const listeners = new WeakMap<HTMLElement, AbortController>();
function replaceListener(page: HTMLElement) {
  listeners.get(page)?.abort(); const controller = new AbortController(); listeners.set(page, controller); return controller.signal;
}
