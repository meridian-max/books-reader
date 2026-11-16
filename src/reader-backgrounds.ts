import { type Settings, escapeHTML as E } from "./types";
import { modal, toast, icon } from "./ui";
import { isNative, native, network, saveFile } from "./native";
const patterns = [
  ["linen", "Natural linen", "#efede5", "#68675c", "lines"],
  ["charcoal", "Charcoal weave", "#292d2f", "#bcc3c5", "lines"],
  ["sky", "Open sky", "#e7f3f8", "#85bfdc", "wash"],
  ["parchment", "Old parchment", "#f1e1b8", "#725c2e", "paper"],
  ["frost", "Winter light", "#f5f4fb", "#a2b5d3", "wash"],
  ["lagoon", "Lagoon", "#d7eeeb", "#4b9d9b", "dots"],
  ["botanical", "Botanical paper", "#f7f3e4", "#959f79", "leaves"],
  ["denim", "Indigo cloth", "#dbe4ed", "#54718b", "lines"],
  ["gingham", "Rose gingham", "#fff0ef", "#d9a4a6", "checks"],
  ["sand", "Sandstone", "#f5e8d4", "#987f60", "dots"],
  ["slate", "Slate frame", "#343e44", "#080f14", "paper"],
  ["midnight", "Midnight linen", "#192329", "#97a9b2", "lines"],
  ["vellum", "Golden vellum", "#f1e6c8", "#9b7b4e", "paper"],
  ["ivory", "Ivory paper", "#f8f6ed", "#a39982", "paper"],
  ["rice", "Rice paper", "#f0eee4", "#9c9a86", "dots"],
];
export const backgrounds = Object.fromEntries(
  patterns.map(([id, name, bg, ink, kind]) => {
    const motif =
      kind === "lines"
        ? `<path d="M0 1H16M1 0V16M0 9H16M9 0V16" stroke="${ink}" stroke-opacity=".09"/>`
        : kind === "checks"
          ? `<path d="M0 0H8V8H0ZM8 8H16V16H8Z" fill="${ink}" opacity=".14"/>`
          : `<circle cx="3" cy="5" r=".7" fill="${ink}" opacity=".16"/><circle cx="12" cy="13" r=".4" fill="${ink}" opacity=".14"/>`;
    const decoration =
      kind === "leaves"
        ? `<path d="M0 15Q100 80 120 0M26 32Q27 0 62 14Q50 40 26 32M70 35Q100 55 111 27Q87 14 70 35" fill="${ink}" opacity=".16"/>`
        : "";
    const wash =
      kind === "wash"
        ? `<linearGradient id="g" x2="0" y2="1"><stop stop-color="${ink}" stop-opacity=".25"/><stop offset=".7" stop-color="${bg}" stop-opacity="0"/></linearGradient>`
        : `<radialGradient id="g"><stop offset=".6" stop-color="${bg}" stop-opacity="0"/><stop offset="1" stop-color="${ink}" stop-opacity="${kind === "paper" ? ".18" : "0"}"/></radialGradient>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640"><defs><pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse">${motif}</pattern>${wash}</defs><path fill="${bg}" d="M0 0H360V640H0Z"/><path fill="url(#p)" d="M0 0H360V640H0Z"/><path fill="url(#g)" d="M0 0H360V640H0Z"/>${decoration}</svg>`;
    return [
      id,
      {
        name,
        bg,
        fg: ["charcoal", "slate", "midnight"].includes(id)
          ? "#eeeae0"
          : "#292b29",
        url:
          "data:image/svg+xml," + encodeURIComponent(svg).replace(/'/g, "%27"),
        svg,
      },
    ];
  }),
);
export function readerBackground(s: Settings) {
  return s.customBackground || backgrounds[s.backgroundPreset]?.url || "";
}
async function imageData(blob: Blob) {
  if (blob.size > 8 * 1024 * 1024)
    throw Error("Choose an image smaller than 8 MB.");
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 40000000)
      throw Error("Choose an image under 40 megapixels.");
    const scale = Math.min(
      1,
      1600 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function backgroundPicker(s: Settings, changed: () => void) {
  const m = modal(
    "Reading backgrounds",
    `<p class="small">15 lightweight backgrounds work offline. Choose a picture from your album or folder, or download one from an image link.</p><div class="background-gallery">${Object.entries(
      backgrounds,
    )
      .map(
        ([id, b]) =>
          `<button data-background="${id}" aria-pressed="${s.backgroundPreset === id && !s.customBackground}" style="background-image:url(&quot;${b.url}&quot;);color:${b.fg}"><span>Aa</span><strong>${b.name}</strong></button>`,
      )
      .join(
        "",
      )}</div><div class="dialog-actions"><button class="secondary" id="background-album">${icon("image", 16)} Album</button><button class="secondary" id="background-folder">${icon("folder", 16)} Folder</button><button class="secondary" id="background-download">${icon("download", 16)} Download image</button><button class="subtle" id="background-save">Save current image</button><button class="subtle" id="background-clear">No background image</button></div><form id="background-url-form" hidden><label class="field">Direct image link<input id="background-url" type="url" placeholder="https://…/image.jpg" required></label><button class="primary" type="submit">Download &amp; use image</button></form><div id="background-folder-files"></div><p id="background-message" role="status" class="small"></p>`,
  );
  m.classList.add("background-dialog");
  const message = m.querySelector("#background-message")!;
  const update = () => {
    m.querySelectorAll<HTMLElement>("[data-background]").forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(
          b.dataset.background === s.backgroundPreset && !s.customBackground,
        ),
      ),
    );
    changed();
  };
  const apply = async (blob: Blob) => {
    s.customBackground = await imageData(blob);
    s.backgroundPreset = "none";
    update();
    message.textContent = "Your image is saved offline.";
  };
  m.querySelectorAll<HTMLElement>("[data-background]").forEach(
    (button) =>
      (button.onclick = () => {
        const id = button.dataset.background!;
        s.backgroundPreset = id;
        s.customBackground = "";
        s.backgroundColor = backgrounds[id].bg;
        s.fontColor = backgrounds[id].fg;
        update();
        message.textContent = backgrounds[id].name + " applied.";
      }),
  );
  const fileInput = (folder = false) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = folder;
    if (folder) input.setAttribute("webkitdirectory", "");
    input.onchange = async () => {
      try {
        const files = [...(input.files ?? [])].filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!files.length) return;
        if (folder) {
          const list = m.querySelector("#background-folder-files")!;
          list.innerHTML = files
            .slice(0, 100)
            .map(
              (f, i) =>
                `<button class="option-row" data-local-background="${i}">${E(f.name)}</button>`,
            )
            .join("");
          list
            .querySelectorAll<HTMLElement>("[data-local-background]")
            .forEach(
              (b) =>
                (b.onclick = () =>
                  void apply(files[Number(b.dataset.localBackground)]).catch(
                    (e) => toast(e.message, true),
                  )),
            );
        } else await apply(files[0]);
      } catch (e) {
        toast((e as Error).message, true);
      }
    };
    input.click();
  };
  m.querySelector("#background-album")!.addEventListener("click", () =>
    fileInput(),
  );
  m.querySelector("#background-folder")!.addEventListener("click", async () => {
    if (!isNative()) {
      fileInput(true);
      return;
    }
    try {
      const uri = await native("pickBackgroundTree");
      const files = await native("listFiles", { uri });
      const images = files
        .filter(
          (f: any) =>
            !f.directory && /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name),
        )
        .slice(0, 100);
      const list = m.querySelector("#background-folder-files")!;
      list.innerHTML = images.length
        ? images
            .map(
              (f: any, i: number) =>
                `<button class="option-row" data-folder-background="${i}">${icon("image", 18)}${E(f.name)}</button>`,
            )
            .join("")
        : "<p>No images in this folder. Choose a folder containing pictures.</p>";
      list.querySelectorAll<HTMLElement>("[data-folder-background]").forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              const f = images[Number(b.dataset.folderBackground)];
              if (f.size > 8 * 1024 * 1024)
                throw Error("Choose an image smaller than 8 MB.");
              const staged = await native("openFile", { uri: f.uri });
              const r = await fetch(staged.url);
              if (!r.ok) throw Error("Could not read this image.");
              await apply(await r.blob());
            } catch (e) {
              toast((e as Error).message, true);
            }
          }),
      );
    } catch (e) {
      toast((e as Error).message, true);
    }
  });
  m.querySelector("#background-download")!.addEventListener("click", () => {
    m.querySelector<HTMLFormElement>("#background-url-form")!.hidden = false;
    m.querySelector<HTMLInputElement>("#background-url")!.focus();
  });
  m.querySelector("#background-url-form")!.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();
      const url = m.querySelector<HTMLInputElement>("#background-url")!.value;
      const button = m.querySelector<HTMLButtonElement>(
        "#background-url-form button",
      )!;
      button.disabled = true;
      try {
        message.textContent = "Downloading image…";
        const r = await network(url);
        if (!r.ok) throw Error("Image download failed. Check the link.");
        if (Number(r.headers.get("Content-Length")) > 8 * 1024 * 1024)
          throw Error("Choose an image smaller than 8 MB.");
        await apply(await r.blob());
      } catch (e) {
        message.textContent = (e as Error).message;
      } finally {
        button.disabled = false;
      }
    },
  );
  m.querySelector("#background-clear")!.addEventListener("click", () => {
    s.customBackground = "";
    s.backgroundPreset = "none";
    s.fontColor = "";
    s.backgroundColor = "";
    update();
    message.textContent = "Using your reading theme.";
  });
  m.querySelector("#background-save")!.addEventListener("click", async () => {
    try {
      const b = backgrounds[s.backgroundPreset];
      if (s.customBackground) {
        const match = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(
          s.customBackground,
        );
        if (!match) throw Error("Import this image again before saving it.");
        const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
        const extension =
          match[1] === "image/jpeg"
            ? "jpg"
            : match[1].split("/")[1].replace("svg+xml", "svg");
        await saveFile(
          "Books-background." + extension,
          new Blob([bytes], { type: match[1] }),
        );
      } else if (b)
        await saveFile(
          "Books-" + s.backgroundPreset + ".svg",
          new Blob([b.svg], { type: "image/svg+xml" }),
        );
      else toast("Choose a background first.");
    } catch (e) {
      toast((e as Error).message, true);
    }
  });
  return m;
}
