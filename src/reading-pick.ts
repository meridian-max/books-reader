import { db } from './db';
import { escapeHTML as E, type Book } from './types';
import { icon, toast } from './ui';
import { reducedMotion } from './motion';

export function mountReadingPick(root: HTMLElement, books: Book[], remembered: string | undefined, cover: (b: Book) => string) {
  const unread = books.filter(b => !b.finished && !b.lastRead);
  const unfinished = books.filter(b => !b.finished);
  const pool = unread.length ? unread : unfinished.length ? unfinished : books;
  if (!pool.length) { root.remove(); return; }
  let selected = pool.find(b => b.id === remembered) ?? (pool.length === 1 ? pool[0] : undefined);
  const description = unread.length ? `${pool.length} unread ${pool.length === 1 ? 'book' : 'books'} on your shelf` : unfinished.length ? `${pool.length} ${pool.length === 1 ? 'book' : 'books'} to return to` : `${pool.length} finished ${pool.length === 1 ? 'book' : 'books'} to revisit`;
  root.innerHTML = `<div class="home-section-heading"><h2>Your next chapter</h2></div><div class="reading-pick"><div class="pick-fan" aria-hidden="true"><img class="pick-side pick-left" width="110" height="164" alt="" loading="lazy" decoding="async"><img class="pick-side pick-right" width="110" height="164" alt="" loading="lazy" decoding="async"><img class="pick-front" width="110" height="164" alt="" loading="lazy" decoding="async"></div><div class="pick-copy"><div class="pick-result" aria-live="polite" aria-atomic="true"><h3></h3><p class="pick-author"></p></div><p class="pick-pool">${E(description)}</p><div class="pick-actions"><button class="primary" data-pick-read hidden>${icon('book',18)} Start this book</button><button class="${selected ? 'secondary' : 'primary'}" data-pick-shuffle ${pool.length === 1 ? 'hidden' : ''}>${icon('refresh',18)}<span>${selected ? 'Pick another' : 'Pick my next read'}</span></button></div></div></div>`;
  const fan = root.querySelector<HTMLElement>('.pick-fan')!;
  const shuffle = root.querySelector<HTMLButtonElement>('[data-pick-shuffle]')!;
  const read = root.querySelector<HTMLButtonElement>('[data-pick-read]')!;
  function draw(animate = false) {
    const center = selected ?? pool[0], neighbors = pool.filter(b => b.id !== center.id).slice(0,2);
    root.querySelector<HTMLImageElement>('.pick-front')!.src = cover(center);
    for (const [index, selector] of ['.pick-left','.pick-right'].entries()) {
      const img = root.querySelector<HTMLImageElement>(selector)!;
      img.hidden = !neighbors[index]; if (neighbors[index]) img.src = cover(neighbors[index]);
    }
    root.querySelector('.pick-result h3')!.textContent = selected?.title ?? 'Let your shelf surprise you.';
    root.querySelector('.pick-author')!.textContent = selected?.author ?? 'A story you already own. A fresh place to begin.';
    read.hidden = !selected;
    if (selected) {
      read.dataset.open = selected.id;
      read.innerHTML = `${icon('book',18)} ${selected.finished ? 'Open this book' : selected.lastRead ? 'Continue reading' : 'Start this book'}`;
    }
    shuffle.querySelector('span')!.textContent = selected ? 'Pick another' : 'Pick my next read';
    shuffle.className = selected ? 'secondary' : 'primary';
    if (animate && !reducedMotion()) {
      fan.getAnimations().forEach(animation => animation.cancel());
      fan.animate([{ rotate:'-5deg', scale:'.94' }, { rotate:'0deg', scale:'1' }], { duration:260, easing:'cubic-bezier(.16,1,.3,1)' });
    }
  }
  shuffle.onclick = () => {
    const eligible = pool.filter(b => b.id !== selected?.id);
    if (!eligible.length) return;
    selected = eligible[crypto.getRandomValues(new Uint32Array(1))[0] % eligible.length];
    draw(true);
    void db.savePreference('reading-pick', selected.id).catch(()=>toast('This pick could not be remembered. You can still open the book.',true));
  };
  draw();
}
