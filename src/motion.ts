// No frame loops or scroll handlers. Return visits preserve visual continuity.
export const reducedMotion = () =>
  document.documentElement.dataset.motion === "reduced" ||
  matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = "cubic-bezier(.16,1,.3,1)";
export function enterPage(root: HTMLElement, firstVisit = true, direction = 1) {
  if (reducedMotion()) return;
  if (firstVisit && root.classList.contains("home-page")) {
    root.querySelector(".continue-cover")?.animate(
      [{ translate: "0 12px", rotate: "-3deg" }, { translate: "0 0", rotate: "0deg" }],
      { duration: 380, easing: ease },
    );
  } else {
    root.animate(
      [{ opacity: .82, translate: `${direction * 10}px 0` }, { opacity: 1, translate: "0 0" }],
      { duration: 160, easing: ease },
    );
  }
}
export function celebrate(root: HTMLElement) {
  if (!reducedMotion() && root)
    root.animate([{ scale: ".985" }, { scale: "1" }], { duration: 220, easing: ease });
}
export function initMotion() {
  document.addEventListener("toggle", event => {
    const el = event.target;
    if (!(el instanceof HTMLDetailsElement) || !el.open || reducedMotion()) return;
    el.animate([{ opacity: .8 }, { opacity: 1 }], { duration: 140, easing: ease });
  }, true);
  const stop = () => {
    if (reducedMotion()) document.getAnimations().forEach(a => a.cancel());
  };
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", stop);
  new MutationObserver(stop).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-motion"],
  });
}
