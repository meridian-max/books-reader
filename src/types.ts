import { extraPalettes } from "./palettes";
export interface Book {
  sourceUri?: string;
  downloaded?: boolean;
  id: string;
  title: string;
  author: string;
  series?: string;
  seriesIndex?: number;
  filename: string;
  format: string;
  added: number;
  lastRead: number;
  progress: number;
  location: string | number;
  cover: string;
  tags: string[];
  favorite: boolean;
  rating: number;
  finished: boolean;
  seconds: number;
  words: number;
  size: number;
  blob: Blob;
}
export interface Mark {
  id: string;
  bookId: string;
  type: "bookmark" | "highlight" | "note";
  location: string | number;
  quote: string;
  note: string;
  color: string;
  created: number;
  updated: number;
  style?: string;
  quads?: number[][];
  deleted?: boolean;
}
export interface Session {
  id: string;
  bookId: string;
  date: string;
  seconds: number;
  words: number;
}
export interface Catalog {
  id: string;
  name: string;
  url: string;
}
export interface Settings {
  motion: "full" | "reduced";
  appTheme: keyof typeof appThemes;
  woody: boolean;
  shelfColumns: number;
  coverProgress: boolean;
  coverRating: boolean;
  underline: boolean;
  fontColor: string;
  backgroundColor: string;
  fontWeight: number;
  fontScale: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  tapLayout: string;
  controlsVersion: number;
  longPressDelay: number;
  horizontalFling: boolean;
  disableVerticalScroll: boolean;
  shakeAction: string;
  shakeThreshold: number;
  hardwareKeys: Record<string, string>;
  backgroundPreset: string;
  letterSpacing: number;
  wordSpacing: number;
  verticalText: boolean;
  trimSpaces: boolean;
  bionic: string;
  fullscreen: boolean;
  scrollLock: boolean;
  doubleTapZoom: boolean;
  miniStatus: string;
  language: string;
  autoSync: boolean;
  eventActions: Record<string, string>;
  savedThemes: { name: string; values: Partial<Settings> }[];
  theme: string;
  font: string;
  fontSize: number;
  lineHeight: number;
  margin: number;
  paragraphGap: number;
  indent: boolean;
  justify: boolean;
  hyphenate: boolean;
  highlightColor: string;
  highlightStyle: string;
  bold: boolean;
  italic: boolean;
  shadow: boolean;
  publisherStyles: boolean;
  flow: "paginated" | "scrolled";
  readingModeVersion: number;
  columns: number;
  animation: string;
  animationSpeed: number;
  brightness: number;
  blueLight: number;
  ruler: string;
  orientation: string;
  keepAwake: boolean;
  volumeKeys: boolean;
  shakeTTS: boolean;
  tiltPages: boolean;
  ttsRate: number;
  ttsPitch: number;
  ttsVoice: string;
  ttsEngine: string;
  ttsPackVoice: string;
  ttsPackAutoUse: boolean;
  autoMode: string;
  autoSpeed: number;
  dailyGoal: number;
  sort: string;
  view: "grid" | "list";
  replacements: string;
  customFont: string;
  customBackground: string;
  tapLeft: string;
  tapCenter: string;
  tapRight: string;
  swipeUp: string;
  swipeDown: string;
  doubleTap: string;
  toolbar: string[];
  eyeReminder: number;
  statusBar: boolean;
  catalogs: Catalog[];
}
export const defaults: Settings = {
  motion: "full",
  appTheme: "classic",
  woody: false,
  shelfColumns: 2,
  coverProgress: true,
  coverRating: true,
  underline: false,
  fontColor: "",
  backgroundColor: "",
  fontWeight: 400,
  fontScale: 100,
  marginLeft: 28, marginRight: 28, marginTop: 28, marginBottom: 28,
  tapLayout: "sides",
  controlsVersion: 1,
  longPressDelay: 650,
  horizontalFling: true,
  disableVerticalScroll: false,
  shakeAction: "none",
  shakeThreshold: 23,
  hardwareKeys: {},
  backgroundPreset: "none",
  letterSpacing: 0,
  wordSpacing: 0,
  verticalText: false,
  trimSpaces: false,
  bionic: "none",
  fullscreen: false,
  scrollLock: false,
  doubleTapZoom: true,
  miniStatus: "{clock} · {title} · {percent}",
  language: "en",
  autoSync: true,
  eventActions: {
    tapTop: "previous", tapBottom: "next",
    miniLeft: "book-info", miniCenter: "none", miniRight: "notes",
    miniLongLeft: "brightness", miniLongCenter: "none", miniLongRight: "none",
    grid0: "previous", grid1: "previous", grid2: "next",
    grid3: "previous", grid4: "toolbar", grid5: "next",
    grid6: "previous", grid7: "next", grid8: "next",
    tapLeft: "previous",
    tapCenter: "toolbar",
    tapRight: "next",
    swipeLeft: "next",
    swipeRight: "previous",
    swipeUp: "none",
    swipeDown: "none",
    doubleTap: "fullscreen",
    longPress: "select-text",
    volumeUp: "previous",
    volumeDown: "next",
    back: "exit",
    menu: "toolbar",
    search: "search",
    camera: "bookmark",
    dpadUp: "previous",
    dpadDown: "next",
    dpadLeft: "previous-chapter",
    dpadRight: "next-chapter",
    dpadCenter: "more",
    headset: "speech",
    mediaNext: "next",
    mediaPrevious: "previous",
    mediaPause: "speech-pause",
  },
  savedThemes: [],
  theme: "paper",
  font: "Literata",
  fontSize: 20,
  lineHeight: 1.7,
  margin: 28,
  paragraphGap: 0.65,
  indent: false,
  justify: false,
  hyphenate: true,
  highlightColor: "#e8cb83",
  highlightStyle: "Highlight",
  bold: false,
  italic: false,
  shadow: false,
  publisherStyles: false,
  flow: "scrolled",
  readingModeVersion: 1,
  columns: 1,
  animation: "slide",
  animationSpeed: 200,
  brightness: 0.65,
  blueLight: 0,
  ruler: "none",
  orientation: "auto",
  keepAwake: true,
  volumeKeys: true,
  shakeTTS: false,
  tiltPages: false,
  ttsRate: 1,
  ttsPitch: 1,
  ttsVoice: "",
  ttsEngine: "",
  ttsPackVoice: "af_heart",
  ttsPackAutoUse: false,
  autoMode: "pixel",
  autoSpeed: 30,
  dailyGoal: 20,
  sort: "recent",
  view: "grid",
  replacements: "",
  customFont: "",
  customBackground: "",
  tapLeft: "previous",
  tapCenter: "toolbar",
  tapRight: "next",
  swipeUp: "none",
  swipeDown: "none",
  doubleTap: "fullscreen",
  toolbar: [
    "appearance",
    "day-night",
    "speech",
    "autoscroll",
    "contents",
    "fullscreen",
    "search",
    "sync",
    "bookmark",
    "more",
  ],
  eyeReminder: 30,
  statusBar: true,
  catalogs: [
    {
      id: "gutenberg",
      name: "Project Gutenberg",
      url: "https://m.gutenberg.org/ebooks.opds/",
    },
    {
      id: "standard",
      name: "Standard Ebooks",
      url: "https://standardebooks.org/feeds/opds",
    },
  ],
};
export const themes: Record<
  string,
  { name: string; bg: string; fg: string; accent: string }
> = {
  ...extraPalettes,
  paper: { name: "Paper", bg: "#faf8f1", fg: "#302e28", accent: "#315d50" },
  sepia: { name: "Sepia", bg: "#f0e2c7", fg: "#4b3826", accent: "#81593b" },
  night: { name: "Midnight", bg: "#171d23", fg: "#c5cbd0", accent: "#a9c5ae" },
  black: { name: "OLED", bg: "#000000", fg: "#b9b9b9", accent: "#93b39d" },
  white: { name: "Daylight", bg: "#ffffff", fg: "#20252b", accent: "#315d50" },
  forest: { name: "Forest", bg: "#e5ece0", fg: "#263f31", accent: "#436c48" },
  ocean: { name: "Ocean", bg: "#e4edf0", fg: "#2c4550", accent: "#41798b" },
  rose: { name: "Rose", bg: "#f3e6e4", fg: "#543c40", accent: "#975f66" },
  slate: { name: "Slate", bg: "#293039", fg: "#d5dbe2", accent: "#a6bac8" },
  amber: { name: "Amber", bg: "#201c15", fg: "#d4b67c", accent: "#deb36e" },
  eink: { name: "E-ink", bg: "#ffffff", fg: "#000000", accent: "#333333" },
  matcha: { name: "Matcha", bg: "#edf0df", fg: "#354033", accent: "#607347" },
  mist: { name: "Mist", bg: "#edf0f3", fg: "#374352", accent: "#5d6e84" },
  cocoa: { name: "Cocoa", bg: "#261f1c", fg: "#dfcbbc", accent: "#d2ae8b" },
  dusk: { name: "Dusk", bg: "#272230", fg: "#dbd1e4", accent: "#c3a9db" },
  ink: { name: "Ink", bg: "#101722", fg: "#cdd6e3", accent: "#9bb6d9" },
  parchment: { name: "Parchment", bg: "#e8ddc5", fg: "#453c2f", accent: "#7c6846" },
  lavender: {
    name: "Lavender",
    bg: "#ece8f1",
    fg: "#45394f",
    accent: "#7e6597",
  },
};
export const appThemes = {
  ...extraPalettes,
  classic:{name:"Signature",bg:"#0d0e10",surface:"#1a1b1e",accent:"#e5d6b8",light:false},
  material:{name:"Pearl",bg:"#f5f4f1",surface:"#e9e8e4",accent:"#665434",light:true},
  dark:{name:"OLED black",bg:"#000000",surface:"#121315",accent:"#e5d6b8",light:false},
  forest:{name:"Evergreen",bg:"#111b18",surface:"#1c2b24",accent:"#b9d3ab",light:false},
  navy:{name:"Deep ocean",bg:"#101822",surface:"#1b2836",accent:"#b4cee6",light:false},
  plum:{name:"Velvet",bg:"#1d1722",surface:"#2d2334",accent:"#dcc3db",light:false},
  sand:{name:"Sandstone",bg:"#eee4d3",surface:"#e3d5be",accent:"#72593b",light:true},
};
export const uid = () => crypto.randomUUID();
export const textOf = (value: any): string =>
  typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.map(textOf).join(", ")
      : value && typeof value === "object"
        ? textOf(value.name ?? value.en ?? Object.values(value)[0])
        : "";
export const escapeHTML = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const dateKey = (date = new Date()) => date.toLocaleDateString("en-CA");
