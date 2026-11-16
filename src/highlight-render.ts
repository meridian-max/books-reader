// EPUB CFIs encode character offsets on text nodes, not DOM child offsets.
// Native Select all and paragraph selections can supply element boundaries.
export function textSelectionRange(selection: Range): Range {
  const range = selection.cloneRange();
  if (
    range.startContainer.nodeType === Node.TEXT_NODE &&
    range.endContainer.nodeType === Node.TEXT_NODE
  )
    return range;
  const doc = range.startContainer.ownerDocument!;
  const walker = doc.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
  );
  let first: Node | undefined, last: Node | undefined;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent?.length && range.intersectsNode(node)) {
      first ??= node;
      last = node;
    }
  }
  if (first && range.startContainer.nodeType !== Node.TEXT_NODE)
    range.setStart(first, 0);
  if (last && range.endContainer.nodeType !== Node.TEXT_NODE)
    range.setEnd(last, last.textContent!.length);
  return range;
}

// One soft marker band per visual line. Blend with the page instead of painting
// pale color over the glyphs. Group opacity avoids darker patches at inline tags.
export function markerHighlight(
  rects: DOMRectList | DOMRect[],
  options: { color?: string; opacity?: number; writingMode?: string } = {},
) {
  const ns = "http://www.w3.org/2000/svg",
    g = document.createElementNS(ns, "g");
  g.setAttribute("fill", options.color ?? "#e8cb83");
  g.setAttribute("opacity", String(options.opacity ?? 0.5));
  if (options.opacity === undefined)
    g.style.opacity = "var(--books-marker-opacity, .5)";
  g.style.mixBlendMode = "var(--books-marker-blend, multiply)";
  const vertical = options.writingMode?.startsWith("vertical") ?? false;
  const lines: { x: number; y: number; right: number; bottom: number }[] = [];
  for (const rect of Array.from(rects)
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) =>
      vertical
        ? {
            left: r.top,
            top: r.left,
            right: r.bottom,
            bottom: r.right,
            height: r.width,
          }
        : r,
    )
    .sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find(
      (l) =>
        Math.min(l.bottom, rect.bottom) - Math.max(l.y, rect.top) >
          Math.min(l.bottom - l.y, rect.height) * 0.65 &&
        rect.left <= l.right + 2 &&
        rect.right >= l.x - 2,
    );
    if (line) {
      line.x = Math.min(line.x, rect.left);
      line.y = Math.min(line.y, rect.top);
      line.right = Math.max(line.right, rect.right);
      line.bottom = Math.max(line.bottom, rect.bottom);
    } else
      lines.push({
        x: rect.left,
        y: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      });
  }
  for (const line of lines) {
    const r = document.createElementNS(ns, "rect");
    const height = line.bottom - line.y;
    const x = line.x - 1.5,
      y = line.y + height * 0.14;
    const width = line.right - line.x + 3,
      band = Math.max(1, height * 0.84);
    r.setAttribute("x", String(vertical ? y : x));
    r.setAttribute("y", String(vertical ? x : y));
    r.setAttribute("width", String(vertical ? band : width));
    r.setAttribute("height", String(vertical ? width : band));
    r.setAttribute("rx", String(Math.min(3, height * 0.12)));
    g.append(r);
  }
  return g;
}
export const highlightColors = [
  { color: "#e8cb83", name: "Honey" },
  { color: "#a8c5a0", name: "Sage" },
  { color: "#9fc9da", name: "Sky" },
  { color: "#c4b2d7", name: "Iris" },
  { color: "#e6aeb4", name: "Rose" },
  { color: "#e6bd96", name: "Peach" },
];
