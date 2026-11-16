import init, { WasmDocument } from "./engines/djvu/djvu_rs.js";
await init();
let document;
const methods = {
  open: ({ buffer }) => {
    document?.free();
    document = WasmDocument.from_bytes(new Uint8Array(buffer));
    return { count: document.page_count(), toc: [] };
  },
  render: async ({ page, width }) => {
    const p = document.page(page);
    try {
      const baseWidth = p.width_at(72),
        baseHeight = p.height_at(72),
        dpi = Math.min(300, Math.max(36, Math.round((72 * width) / baseWidth)));
      const w = p.width_at(dpi),
        h = p.height_at(dpi);
      const canvas = new OffscreenCanvas(w, h);
      canvas
        .getContext("2d")
        .putImageData(new ImageData(p.render(dpi), w, h), 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const zones = JSON.parse(p.text_zones_json(72) || "[]");
      return {
        png: new Uint8Array(await blob.arrayBuffer()),
        bounds: [0, 0, baseWidth, baseHeight],
        text: {
          blocks: [
            {
              lines: zones.map((z) => ({
                text: z.t,
                bbox: { x: z.x, y: z.y, w: z.w, h: z.h },
                font: { size: Math.max(5, z.h * 0.82) },
              })),
            },
          ],
        },
        plainText: p.text() || "",
        widgets: [],
      };
    } finally {
      p.free();
    }
  },
  text: ({ page }) => {
    const p = document.page(page);
    try {
      return { text: p.text() || "" };
    } finally {
      p.free();
    }
  },
  search: ({ query }) => {
    const out = [];
    for (let page = 0; page < document.page_count(); page++) {
      const p = document.page(page);
      try {
        const text = p.text() || "";
        if (text.toLowerCase().includes(query.toLowerCase()))
          out.push({ page, quads: [[]] });
      } finally {
        p.free();
      }
      if (out.length >= 200) break;
    }
    return out;
  },
  close: () => {
    document?.free();
    document = undefined;
  },
};
self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    if (!methods[method])
      throw Error(
        "DjVu annotations are stored in the Books notebook; source-file editing is not supported.",
      );
    self.postMessage({ id, ok: true, data: await methods[method](args || {}) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e.message });
  }
};
self.postMessage({ ready: true });
