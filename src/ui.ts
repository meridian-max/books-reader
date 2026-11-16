import {
  createElement,
  Calendar,
  Monitor,
  BookOpen,
  Library,
  Search,
  Plus,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  MoreVertical,
  Grid2X2,
  List,
  Heart,
  Bookmark,
  Highlighter,
  Settings,
  Cloud,
  Globe,
  FolderOpen,
  ChartNoAxesCombined,
  Sun,
  Moon,
  Volume2,
  Headphones,
  Pause,
  Play,
  SkipForward,
  SkipBack,
  Type,
  SlidersHorizontal,
  Download,
  Upload,
  Trash2,
  Share2,
  Clock,
  Flame,
  Target,
  FileText,
  Menu,
  RefreshCw,
  CheckCheck,
  Star,
  Pencil,
  Lock,
  Eye,
  WifiOff,
  Info,
  Keyboard,
  Copy,
  BookMarked,
  Palette,
  FolderPlus,
  RotateCw,
  Minimize,
  Maximize,
  ZoomIn,
  ZoomOut,
  MoveVertical,
  UserRound,
  Sparkles,
  Trophy,
  LogOut,
  ShieldCheck,
} from "lucide";
import { escapeHTML as E } from "./types";
const nodes: Record<string, any> = {
  user: UserRound, sparkles: Sparkles, trophy: Trophy, logout: LogOut, shield: ShieldCheck,
  calendar: Calendar,
  monitor: Monitor,
  book: BookOpen,
  library: Library,
  search: Search,
  plus: Plus,
  arrow: ArrowRight,
  back: ArrowLeft,
  external: ArrowUpRight,
  down: ChevronDown,
  chevron: ChevronRight,
  close: X,
  check: Check,
  more: MoreVertical,
  grid: Grid2X2,
  list: List,
  heart: Heart,
  bookmark: Bookmark,
  highlight: Highlighter,
  settings: Settings,
  cloud: Cloud,
  globe: Globe,
  folder: FolderOpen,
  stats: ChartNoAxesCombined,
  sun: Sun,
  moon: Moon,
  speech: Volume2,
  headphones: Headphones,
  pause: Pause,
  play: Play,
  next: SkipForward,
  prev: SkipBack,
  type: Type,
  sliders: SlidersHorizontal,
  download: Download,
  upload: Upload,
  trash: Trash2,
  share: Share2,
  clock: Clock,
  flame: Flame,
  target: Target,
  file: FileText,
  menu: Menu,
  refresh: RefreshCw,
  finished: CheckCheck,
  star: Star,
  pencil: Pencil,
  lock: Lock,
  eye: Eye,
  offline: WifiOff,
  info: Info,
  keyboard: Keyboard,
  copy: Copy,
  notebook: BookMarked,
  palette: Palette,
  collection: FolderPlus,
  rotate: RotateCw,
  minimize: Minimize,
  maximize: Maximize,
  "zoom-in": ZoomIn,
  "zoom-out": ZoomOut,
  move: MoveVertical,
};
const iconMarkup = new Map<string, string>();
export function icon(name: string, size = 20) {
  const key = `${nodes[name] ? name : "book"}:${size}`;
  const cached = iconMarkup.get(key);
  if (cached) return cached;
  const markup = createElement([
    (nodes[name] ?? BookOpen)[0],
    {
      ...(nodes[name] ?? BookOpen)[1],
      width: String(size),
      height: String(size),
      "stroke-width": "1.65",
      "aria-hidden": "true",
    },
    (nodes[name] ?? BookOpen)[2],
  ]).outerHTML;
  iconMarkup.set(key, markup);
  return markup;
}
export const button = (
  name: string,
  label: string,
  action: string,
  cls = "icon-button",
) =>
  `<button class="${cls}" data-action="${E(action)}" aria-label="${E(label)}" title="${E(label)}">${icon(name)}${cls.includes("text") ? `<span>${E(label)}</span>` : ""}</button>`;
let toastTimer: ReturnType<typeof setTimeout>;
let modalReturnFocus: HTMLElement | null = null;
export function toast(message: string, error = false) {
  const el = document.querySelector("#toast")!;
  el.textContent = message;
  el.className = "visible" + (error ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 5000);
}
export function closeModal() {
  const hadModal = !!document.querySelector(".modal");
  document.querySelector(".modal")?.dispatchEvent(new Event("modalclose"));
  document.querySelector("#modal-root")!.replaceChildren();
  const target = modalReturnFocus;
  modalReturnFocus = null;
  if (hadModal && target?.isConnected && target.getClientRects().length && !target.closest("[inert]"))
    target.focus({ preventScroll: true });
}
export function modal(
  title: string,
  body: string,
  options: { wide?: boolean; subtitle?: string; footer?: string } = {},
) {
  closeModal();
  modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = document.querySelector("#modal-root")!;
  root.innerHTML = `<div class="modal-backdrop"><section class="modal ${options.wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${E(title)}"><header class="modal-header"><div><h2>${E(title)}</h2>${options.subtitle ? `<p>${E(options.subtitle)}</p>` : ""}</div><button class="icon-button close-modal" aria-label="Close dialog">${icon("close")}</button></header><div class="modal-body">${body}</div>${options.footer ? `<footer class="modal-footer">${options.footer}</footer>` : ""}</section></div>`;
  root.querySelector(".close-modal")?.addEventListener("click", closeModal);
  root.querySelector(".modal-backdrop")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  const f = root.querySelector<HTMLElement>("input,button,select,textarea");
  f?.focus();
  return root.querySelector<HTMLElement>(".modal")!;
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (e.key === "Tab") {
    const root = document.querySelector(".modal");
    if (!root) return;
    const items = [
      ...root.querySelectorAll<HTMLElement>(
        'button,input,select,textarea,a[href],summary,[tabindex]:not([tabindex="-1"])',
      ),
    ].filter((x) => !x.hasAttribute("disabled") && !x.closest("[inert]") && x.getClientRects().length > 0 && getComputedStyle(x).visibility !== "hidden");
    const first = items[0],
      last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});
export function confirmDialog(
  title: string,
  message: string,
  label = "Continue",
): Promise<boolean> {
  return new Promise((resolve) => {
    const m = modal(
      title,
      `<p>${E(message)}</p><div class="dialog-actions"><button class="secondary" id="cancel-dialog">Cancel</button><button class="primary" id="confirm-dialog">${E(label)}</button></div>`,
    );
    m.addEventListener("modalclose", () => resolve(false), { once: true });
    m.querySelector("#cancel-dialog")!.addEventListener("click", () => {
      resolve(false);
      closeModal();
    });
    m.querySelector("#confirm-dialog")!.addEventListener("click", () => {
      resolve(true);
      closeModal();
    });
    m.querySelector(".close-modal")!.addEventListener("click", () =>
      resolve(false),
    );
  });
}
export function inputDialog(
  title: string,
  label: string,
  value = "",
  type = "text",
  allowEmpty = false,
): Promise<string | null> {
  return new Promise((resolve) => {
    const m = modal(
      title,
      `<form id="input-dialog"><label class="field">${E(label)}<input name="value" type="${type}" value="${E(value)}" ${allowEmpty ? "" : "required"} autocomplete="off"></label><div class="dialog-actions"><button type="submit" class="primary">Continue ${icon("arrow", 16)}</button></div></form>`,
    );
    m.addEventListener("modalclose", () => resolve(null), { once: true });
    m.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = (m.querySelector("input") as HTMLInputElement).value;
      resolve(value);
      closeModal();
    });
    m.querySelector(".close-modal")!.addEventListener("click", () =>
      resolve(null),
    );
  });
}
export const range = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step = 1,
  suffix = "",
) =>
  `<label class="range-field"><span>${E(label)}<output>${value}${E(suffix)}</output></span><input type="range" data-setting="${E(key)}" data-suffix="${E(suffix)}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
export const toggle = (
  key: string,
  label: string,
  checked: boolean,
  description = "",
) =>
  `<label class="toggle-field"><span>${E(label)}${description ? `<small>${E(description)}</small>` : ""}</span><input type="checkbox" data-setting="${E(key)}" ${checked ? "checked" : ""}><span class="switch"></span></label>`;
export const select = (
  key: string,
  label: string,
  value: string | number,
  options: Record<string, string>,
) =>
  `<label class="select-field"><span>${E(label)}</span><select data-setting="${E(key)}">${Object.entries(
    options,
  )
    .map(
      ([k, v]) =>
        `<option value="${E(k)}" ${String(value) === k ? "selected" : ""}>${E(v)}</option>`,
    )
    .join("")}</select></label>`;
