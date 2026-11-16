import { isNative, native } from "./native";
const svgNS = "http://www.w3.org/2000/svg";
type Point = [number, number];
function clipped(
  poly: Point[],
  cx: number,
  cy: number,
  nx: number,
  ny: number,
  side: number,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = ((a[0] - cx) * nx + (a[1] - cy) * ny) * side,
      db = ((b[0] - cx) * nx + (b[1] - cy) * ny) * side;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}
/** A screenshot of the outgoing page folds across a moving crease; the live next page remains underneath. */
export async function turnTransition(
  viewport: HTMLElement,
  kind: string,
  duration: number,
  backward: boolean,
  turn: () => Promise<void>,
) {
  if (kind === "none" || kind === "eink" || matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced") {
    await turn();
    return;
  }
  const ms = Math.min(1200, Math.max(100, duration || 300));
  let image = "";
  const r = viewport.getBoundingClientRect();
  if (isNative() && ["curl", "flip", "slide", "fade", "vertical", "zoom"].includes(kind))
    try {
      image = await native("capture", {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        viewportWidth: innerWidth,
      });
    } catch {}
  if (!image) {
    await turn();
    const from:Keyframe=kind==='vertical'?{transform:`translateY(${backward?-18:18}px)`,opacity:.65}:kind==='zoom'?{transform:'scale(.96)',opacity:.65}:kind==='fade'?{opacity:0}:kind==='flip'?{transform:`perspective(1200px) rotateY(${backward?-12:12}deg)`,opacity:.6}:{opacity:.75,transform:`translateX(${backward?-10:10}px)`};
    await viewport.animate([from,{opacity:1,transform:'none'}],{duration:ms}).finished;
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "page-transition";
  overlay.style.cssText = `position:fixed;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;overflow:hidden;z-index:35;pointer-events:auto;background:transparent;`;
  const img = document.createElement("img");
  img.src = image;
  img.style.cssText =
    "position:absolute;width:100%;height:100%;inset:0;object-fit:fill;";
  overlay.append(img);
  document.body.append(overlay);
  try {
    await turn();
    if (kind !== "curl") {
      const end =
        kind === "fade"
          ? { opacity: 0 }
          : kind === "vertical" ? {transform:`translateY(${backward?100:-100}%)`}
          : kind === "zoom" ? {transform:'scale(1.12)',opacity:0}
          : kind === "flip"
            ? {
                transform: `perspective(1500px) rotateY(${backward ? 90 : -90}deg)`,
                opacity: 0.5,
              }
            : { transform: `translateX(${backward ? 100 : -100}%)` };
      img.style.transformOrigin = backward ? "right center" : "left center";
      await img.animate([{}, end], {
        duration: ms,
        easing: "ease-out",
        fill: "forwards",
      }).finished;
      return;
    }
    const w = r.width,
      h = r.height,
      id = "fold-" + crypto.randomUUID();
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.style.cssText = `width:100%;height:100%;${backward ? "transform:scaleX(-1);" : ""}`;
    svg.innerHTML = `<defs><clipPath id="${id}-front"><polygon/></clipPath><clipPath id="${id}-back"><polygon/></clipPath><linearGradient id="${id}-shade"><stop stop-color="#000" stop-opacity=".28"/><stop offset=".16" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#aaa" stop-opacity=".18"/></linearGradient></defs><image href="${image}" width="${w}" height="${h}" clip-path="url(#${id}-front)"/><g class="fold-back"><g clip-path="url(#${id}-back)"><image href="${image}" width="${w}" height="${h}" opacity=".8"/><rect width="${w}" height="${h}" fill="url(#${id}-shade)"/></g></g>`;
    if (backward)
      for (const el of svg.querySelectorAll("image"))
        el.setAttribute("transform", `translate(${w},0) scale(-1,1)`);
    overlay.replaceChildren(svg);
    const front = svg.querySelector(`#${id}-front polygon`)!,
      back = svg.querySelector(`#${id}-back polygon`)!,
      fold = svg.querySelector(".fold-back")!;
    await new Promise<void>((resolve) => {
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / ms),
          e = 1 - Math.pow(1 - t, 2),
          qx = w * (1 - 2.08 * e),
          qy = h - Math.sin(Math.PI * e) * h * 0.13,
          cx = (w + qx) / 2,
          cy = (h + qy) / 2,
          dx = w - qx,
          dy = h - qy,
          len = Math.hypot(dx, dy) || 1,
          nx = dx / len,
          ny = dy / len;
        const rect: Point[] = [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
          ],
          points = (p: Point[]) => p.map((x) => x.join(",")).join(" ");
        front.setAttribute("points", points(clipped(rect, cx, cy, nx, ny, -1)));
        back.setAttribute("points", points(clipped(rect, cx, cy, nx, ny, 1)));
        const dot = nx * cx + ny * cy;
        fold.setAttribute(
          "transform",
          `matrix(${1 - 2 * nx * nx} ${-2 * nx * ny} ${-2 * nx * ny} ${1 - 2 * ny * ny} ${2 * nx * dot} ${2 * ny * dot})`,
        );
        svg.dataset.progress = String(t);
        t < 1 ? requestAnimationFrame(frame) : resolve();
      };
      requestAnimationFrame(frame);
    });
  } finally {
    overlay.remove();
  }
}
