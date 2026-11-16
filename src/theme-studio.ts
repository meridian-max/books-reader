import { appThemes, themes, escapeHTML as E } from "./types";
import { icon } from "./ui";
export function isLight(bg: string) {
  const rgb=bg.match(/[a-f\d]{2}/gi)!.map(x=>parseInt(x,16)/255);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.55;
}
export function themeFilters() {
 return `<div class="theme-browser-tools"><label class="theme-search">${icon("search",18)}<input type="search" aria-label="Search themes" placeholder="Find a color you love"></label><div class="theme-filters" role="group" aria-label="Theme brightness"><button data-theme-filter="all" aria-pressed="true">All</button><button data-theme-filter="light" aria-pressed="false">${icon("sun",16)} Light</button><button data-theme-filter="dark" aria-pressed="false">${icon("moon",16)} Dark</button></div><p class="theme-result-count small" role="status"></p></div>`;
}
export function bindThemeFilters(root: HTMLElement, selector: string) {
 const input=root.querySelector<HTMLInputElement>('.theme-search input')!;
 const count=root.querySelector<HTMLElement>('.theme-result-count')!;
 let mode='all';
 const apply=()=>{
  let visible=0;
  root.querySelectorAll<HTMLElement>(selector).forEach(button=>{
   const id=button.dataset.appPalette??button.dataset.theme??button.dataset.loadTheme!;
   const palette=button.dataset.appPalette ? appThemes[id as keyof typeof appThemes] : themes[id];
   button.hidden=!(mode==='all'||isLight(palette.bg)===(mode==='light'))||!palette.name.toLowerCase().includes(input.value.toLowerCase().trim());
   if(!button.hidden)visible++;
  });
  count.textContent=visible ? `${visible} ${visible===1?'theme':'themes'}` : 'No matching themes. Try another name.';
 };
 input.oninput=apply;
 root.querySelectorAll<HTMLElement>('[data-theme-filter]').forEach(b=>b.onclick=()=>{mode=b.dataset.themeFilter!;root.querySelectorAll('[data-theme-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));apply()});
 apply();
}
export function appThemeGallery(selected: string) {
 return `<p class="theme-current small">Your library, in <strong>${E(appThemes[selected as keyof typeof appThemes]?.name??'Signature')}</strong>.</p>${themeFilters()}<div class="app-theme-library">${Object.entries(appThemes).map(([id,t])=>`<button data-app-palette="${id}" aria-pressed="${id===selected}" style="--palette-bg:${t.bg};--palette-surface:${t.surface};--palette-accent:${t.accent};--palette-ink:${t.light?'#302d2b':'#eae7e2'}"><div class="theme-miniature"><span class="mini-book">A quiet<br>chapter</span><span class="mini-caption">One more<br>chapter.</span><span class="mini-action">Continue reading ${icon('arrow',12)}</span></div><strong>${E(t.name)}</strong><small>${t.light?'Light':'Dark'}</small>${icon('check',18)}</button>`).join('')}</div>`;
}
