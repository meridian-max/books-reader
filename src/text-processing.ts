import type { Settings } from "./types";
export function processDocument(doc: Document, settings: Settings) {
  const root =
    doc.body ??
    doc.getElementsByTagNameNS("*", "body")[0] ??
    doc.documentElement;
  if (!root) return;
  const signature = JSON.stringify([
    settings.replacements,
    settings.trimSpaces,
    settings.bionic,
  ]);
  if (root.getAttribute("data-books-processed") === signature) return;
  root.setAttribute("data-books-processed", signature);
  const replacements = settings.replacements
    .split("\n")
    .map((line) => {
      const at = line.indexOf("=>");
      return at < 0
        ? null
        : [line.slice(0, at).trim(), line.slice(at + 2).trim()];
    })
    .filter((pair): pair is string[] => !!pair?.[0]);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest("script,style,pre,code,svg,math")) continue;
    let text = node.data;
    for (const [from, to] of replacements) text = text.split(from).join(to);
    if (settings.trimSpaces) text = text.replace(/[ \t\u00a0]{2,}/g, " ");
    node.data = text;
    if (
      settings.bionic !== "none" &&
      text.trim() &&
      !node.parentElement?.closest("[data-bionic]")
    ) {
      const fragment = doc.createDocumentFragment();
      let offset = 0;
      for (const match of text.matchAll(/\p{L}[\p{L}\p{M}]*/gu)) {
        const index = match.index!,
          word = match[0];
        fragment.append(text.slice(offset, index));
        const strong = doc.createElement("b");
        strong.dataset.bionic = "true";
        const count = Math.ceil(
          [...word].length * (settings.bionic === "third" ? 0.33 : 0.5),
        );
        const letters = [...word];
        strong.textContent = letters.slice(0, count).join("");
        fragment.append(strong, letters.slice(count).join(""));
        offset = index + word.length;
      }
      fragment.append(text.slice(offset));
      node.replaceWith(fragment);
    }
  }
  if (settings.trimSpaces)
    for (const p of root.querySelectorAll("p"))
      if (!p.textContent?.trim() && !p.querySelector("img,svg,video,audio"))
        p.remove();
}
