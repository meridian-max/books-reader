export const readerFonts: Record<
  string,
  { label: string; family: string; file?: string; category: string }
> = {
  Publisher: {
    label: "Publisher original",
    family: "inherit",
    category: "Book typography",
  },
  Literata: {
    label: "Literata",
    family: "BooksLiterata",
    file: "literata.ttf",
    category: "Serif",
  },
  Lora: {
    label: "Lora",
    family: "BooksLora",
    file: "lora.ttf",
    category: "Serif",
  },
  Merriweather: {
    label: "Merriweather",
    family: "BooksMerriweather",
    file: "merriweather.ttf",
    category: "Serif",
  },
  CrimsonPro: {
    label: "Crimson Pro",
    family: "BooksCrimson",
    file: "crimsonpro.ttf",
    category: "Serif",
  },
  EBGaramond: {
    label: "EB Garamond",
    family: "BooksGaramond",
    file: "ebgaramond.ttf",
    category: "Serif",
  },
  SourceSerif: {
    label: "Source Serif 4",
    family: "BooksSourceSerif",
    file: "sourceserif4.ttf",
    category: "Serif",
  },
  NotoSerif: {
    label: "Noto Serif",
    family: "BooksNotoSerif",
    file: "notoserif.ttf",
    category: "Serif",
  },
  Manrope: {
    label: "Manrope · app font",
    family: "BooksManrope",
    file: "manrope.ttf",
    category: "Sans serif",
  },
  Atkinson: {
    label: "Atkinson Hyperlegible Next",
    family: "BooksAtkinson",
    file: "atkinsonhyperlegiblenext.ttf",
    category: "Sans serif",
  },
  Lexend: {
    label: "Lexend",
    family: "BooksLexend",
    file: "lexend.ttf",
    category: "Sans serif",
  },
  NotoSans: {
    label: "Noto Sans",
    family: "BooksNotoSans",
    file: "notosans.ttf",
    category: "Sans serif",
  },
  OpenSans: {
    label: "Open Sans",
    family: "BooksOpenSans",
    file: "opensans.ttf",
    category: "Sans serif",
  },
  DevanagariSerif: {
    label: "Noto Serif Devanagari · हिन्दी",
    family: "BooksDevanagariSerif",
    file: "notoserifdevanagari.ttf",
    category: "Hindi",
  },
  DevanagariSans: {
    label: "Noto Sans Devanagari · हिन्दी",
    family: "BooksDevanagariSans",
    file: "notosansdevanagari.ttf",
    category: "Hindi",
  },
  DejaVu: {
    label: "DejaVu Serif",
    family: "BooksDejaVu",
    file: "reader-serif.ttf",
    category: "Serif",
  },
  System: { label: "System", family: "system-ui", category: "System" },
  Sans: {
    label: "Arial / sans serif",
    family: "Arial,sans-serif",
    category: "System",
  },
  Mono: { label: "Monospace", family: "monospace", category: "System" },
};
export const fontOptions = Object.fromEntries(
  Object.entries(readerFonts).map(([key, value]) => [key, value.label]),
);
export const fontFaceCSS = (origin = location.origin) =>
  Object.values(readerFonts)
    .filter((f) => f.file)
    .map(
      (f) =>
        `@font-face{font-family:${f.family};src:url('${origin}/fonts/${f.file}');font-weight:100 900;font-display:swap;}`,
    )
    .join("");
// The selector previews and the chapter iframe use the same actual offline files.
const style = document.createElement("style");
style.textContent = fontFaceCSS();
document.head.append(style);
