import {
  actionNames,
  eventNames,
  orientationNames,
  tapLayouts,
} from "./controls";
import { type Settings, escapeHTML as E, defaults } from "./types";
import { modal, closeModal, select, toggle, range, icon, toast } from "./ui";
import { isNative, native } from "./native";

const actionSelect = (s: Settings, key: string, label: string) =>
  `<label class="select-field"><span>${E(label)}</span><select data-control="${key}">${Object.entries(
    key === "longPress"
      ? { ...actionNames, "select-text": "Text selection" }
      : actionNames,
  )
    .map(
      ([id, name]) =>
        `<option value="${id}" ${s.eventActions[key] === id ? "selected" : ""}>${E(name)}</option>`,
    )
    .join("")}</select></label>`;
const group = (title: string, body: string, open = false) =>
  `<details class="preference-group" ${open ? "open" : ""}><summary>${title}</summary>${body}</details>`;
export function searchableOptions(m: HTMLElement) {
  const search = document.createElement("input");
  search.type = "search";
  search.className = "options-search";
  search.placeholder = "Find a setting";
  search.setAttribute("aria-label", "Find a setting");
  m.querySelector(".modal-body")!.prepend(search);
  const rowSelector =
    ".select-field,.range-field,.toggle-field,[data-option-search]";
  const details = [...m.querySelectorAll<HTMLDetailsElement>("details")];
  const before = new Map<HTMLDetailsElement, boolean>();
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    if (q && !before.size) details.forEach((d) => before.set(d, d.open));
    const rows = [...m.querySelectorAll<HTMLElement>(rowSelector)];
    rows.forEach((row) => {
      const section =
        row.closest("details")?.querySelector("summary")?.textContent ?? "";
      row.hidden =
        !!q && !`${section} ${row.textContent}`.toLowerCase().includes(q);
    });
    details.forEach((d) => {
      const inside = rows.filter((r) => d.contains(r));
      d.hidden = !!q && inside.length > 0 && !inside.some((r) => !r.hidden);
      if (q) d.open = true;
      else if (before.has(d)) d.open = before.get(d)!;
    });
    if (!q) before.clear();
  };
}
export function rangeSteppers(m: HTMLElement) {
  m.querySelectorAll<HTMLInputElement>(
    "input[type=range][data-setting]",
  ).forEach((input) => {
    if (input.closest(".range-controls")) return;
    const wrap = document.createElement("div");
    wrap.className = "range-controls";
    input.replaceWith(wrap);
    for (const [delta, text, name] of [
      [-1, "−", "Decrease"],
      [1, "+", "Increase"],
    ] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.setAttribute("aria-label", `${name} ${input.dataset.setting}`);
      b.onclick = () => {
        const v = Number(input.value) + delta * Number(input.step || 1);
        input.value = String(
          Math.max(
            Number(input.min),
            Math.min(Number(input.max), Math.round(v * 10000) / 10000),
          ),
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      wrap.append(b);
    }
    wrap.insertBefore(input, wrap.lastChild);
  });
}
export function controlsSheet(
  s: Settings,
  changed: () => void,
  perform: (action: string) => unknown,
) {
  const mini = [
    "miniLeft",
    "miniCenter",
    "miniRight",
    "miniLongLeft",
    "miniLongCenter",
    "miniLongRight",
  ];
  const miniLabels = [
    "Tap left",
    "Tap middle",
    "Tap right",
    "Long-tap left",
    "Long-tap middle",
    "Long-tap right",
  ];
  const keys = [
    "volumeUp",
    "volumeDown",
    "back",
    "menu",
    "search",
    "camera",
    "dpadUp",
    "dpadDown",
    "dpadLeft",
    "dpadRight",
    "dpadCenter",
    "headset",
    "mediaNext",
    "mediaPrevious",
    "mediaPause",
  ];
  const m = modal(
    "Control Options",
    group(
      "Phone & orientation",
      select(
        "orientation",
        "Screen orientation",
        s.orientation,
        orientationNames,
      ) +
        `<label class="select-field"><span>Shake phone</span><select id="shake-action">${Object.entries(
          actionNames,
        )
          .map(
            ([id, name]) =>
              `<option value="${id}" ${id === s.shakeAction ? "selected" : ""}>${name}</option>`,
          )
          .join("")}</select></label>` +
        range("shakeThreshold", "Shake strength", s.shakeThreshold, 15, 40, 1) +
        `<p class="small">Higher values need a stronger shake. Sensor behavior depends on your phone.</p>`,
      true,
    ) +
      group(
        "Screen touch control",
        select(
          "tapLayout",
          "Tap layout",
          s.tapLayout,
          Object.fromEntries(
            Object.entries(tapLayouts).map(([id, l]) => [id, l.label]),
          ),
        ) +
          `<div class="tap-grid" aria-label="Screen tap zones"></div><p class="small">Tap a square to choose its action. Custom grid lets every square do something different.</p><div id="tap-zone-editor"></div>` +
          actionSelect(s, "longPress", "Long tap on screen") +
          range(
            "longPressDelay",
            "Long-tap delay",
            s.longPressDelay,
            350,
            1200,
            50,
            " ms",
          ),
        true,
      ) +
      group(
        "Finger gestures",
        ["swipeLeft", "swipeRight", "swipeDown", "swipeUp", "doubleTap"]
          .map((k) => actionSelect(s, k, eventNames[k]))
          .join("") +
          toggle(
            "horizontalFling",
            "Allow horizontal flings to turn pages",
            s.horizontalFling,
          ) +
          toggle(
            "disableVerticalScroll",
            "Disable vertical scrolling on touch",
            s.disableVerticalScroll,
            "Page buttons and configured swipe actions still work.",
          ),
      ) +
      group(
        "Hardware buttons",
        toggle("volumeKeys", "Use volume keys in the reader", s.volumeKeys) +
          keys.map((k) => actionSelect(s, k, eventNames[k])).join("") +
          `<h3>Custom hardware keycodes</h3><div id="custom-key-list"></div><div class="keycode-editor" data-option-search><label>Android keycode<input type="number" id="hardware-code" min="1" max="1000" placeholder="Example: 131"></label><button class="secondary" id="learn-key" ${!isNative() ? "disabled" : ""}>Detect key</button><button class="secondary" id="add-key">Add mapping</button></div><p class="small" id="key-hint">Use Detect key, or enter the Android keycode. Back has its own setting above.</p>`,
      ) +
      group(
        "Mini status bar",
        toggle("statusBar", "Show mini status bar when reading", s.statusBar) +
          `<label class="field"><span>Status text</span><input data-setting="miniStatus" value="${E(s.miniStatus)}"><small>{clock}, {title}, {chapter}, {percent}</small></label>` +
          mini.map((k, i) => actionSelect(s, k, miniLabels[i])).join(""),
      ) +
      `<div class="dialog-actions"><button class="secondary" id="reset-controls">Reset controls</button><button class="secondary" data-options-page="appearance">Visual Options</button><button class="secondary" data-options-page="miscellaneous">Miscellaneous</button></div>`,
  );
  m.classList.add("reader-options", "control-options");
  let activeZone = 4,
    detecting = false;
  const bindAction = (root: Element) =>
    root.querySelectorAll<HTMLSelectElement>("[data-control]").forEach(
      (input) =>
        (input.onchange = () => {
          s.eventActions[input.dataset.control!] = input.value;
          changed();
          renderGrid();
        }),
    );
  const renderGrid = () => {
    const layout = tapLayouts[s.tapLayout] ?? tapLayouts.sides;
    m.querySelector(".tap-grid")!.innerHTML = layout.cells
      .map(
        (key, i) =>
          `<button data-zone="${i}" aria-pressed="${i === activeZone}" aria-label="Tap zone ${i + 1}: ${E(actionNames[s.eventActions[key]] ?? "None")}"><small>${["Top left", "Top middle", "Top right", "Middle left", "Center", "Middle right", "Bottom left", "Bottom middle", "Bottom right"][i]}</small><span>${E(actionNames[s.eventActions[key]] ?? "None")}</span></button>`,
      )
      .join("");
    m.querySelectorAll<HTMLElement>("[data-zone]").forEach(
      (b) =>
        (b.onclick = () => {
          activeZone = Number(b.dataset.zone);
          renderGrid();
        }),
    );
    const editor = m.querySelector("#tap-zone-editor")!;
    editor.innerHTML = actionSelect(
      s,
      layout.cells[activeZone],
      `Action for zone ${activeZone + 1}`,
    );
    bindAction(editor);
  };
  bindAction(m);
  renderGrid();
  m.querySelector("#shake-action")!.addEventListener("change", (e) => {
    s.shakeAction = (e.target as HTMLSelectElement).value;
    s.shakeTTS = s.shakeAction === "speech";
    changed();
  });
  m.querySelector("[data-setting=tapLayout]")!.addEventListener(
    "input",
    (e) => {
      s.tapLayout = (e.target as HTMLSelectElement).value;
      renderGrid();
    },
  );
  const renderKeys = () => {
    const list = m.querySelector("#custom-key-list")!;
    list.innerHTML = Object.entries(s.hardwareKeys)
      .map(
        ([code, action]) =>
          `<div class="custom-key-row"><label class="select-field"><span>Key ${E(code)}</span><select data-hardware="${E(code)}">${Object.entries(
            actionNames,
          )
            .map(
              ([k, v]) =>
                `<option value="${k}" ${k === action ? "selected" : ""}>${v}</option>`,
            )
            .join(
              "",
            )}</select></label><button class="subtle" data-remove-key="${E(code)}" aria-label="Remove key ${E(code)}">${icon("trash", 18)}</button></div>`,
      )
      .join("");
    list.querySelectorAll<HTMLSelectElement>("[data-hardware]").forEach(
      (i) =>
        (i.onchange = () => {
          s.hardwareKeys[i.dataset.hardware!] = i.value;
          changed();
        }),
    );
    list.querySelectorAll<HTMLElement>("[data-remove-key]").forEach(
      (b) =>
        (b.onclick = () => {
          delete s.hardwareKeys[b.dataset.removeKey!];
          changed();
          renderKeys();
        }),
    );
  };
  renderKeys();
  m.querySelector("#add-key")!.addEventListener("click", () => {
    const code = Number(
      m.querySelector<HTMLInputElement>("#hardware-code")!.value,
    );
    if (
      !Number.isInteger(code) ||
      code < 1 ||
      code > 1000 ||
      [3, 4, 26, 187].includes(code)
    ) {
      toast(
        "Enter a valid keycode. Home, Back, Power and recent apps use system controls.",
        true,
      );
      return;
    }
    s.hardwareKeys[String(code)] ??= "none";
    changed();
    renderKeys();
  });
  const onCode = (e: Event) => {
    if (!detecting) return;
    detecting = false;
    m.querySelector<HTMLInputElement>("#hardware-code")!.value = String(
      (e as CustomEvent).detail,
    );
    m.querySelector("#key-hint")!.textContent =
      "Key detected. Tap Add mapping, then choose an action.";
  };
  window.addEventListener("native:keycode", onCode);
  m.querySelector("#learn-key")!.addEventListener("click", () => {
    detecting = true;
    m.querySelector("#key-hint")!.textContent = "Press a hardware key…";
    void native("captureKey", { enabled: true }).catch((e) =>
      toast(e.message, true),
    );
  });
  m.addEventListener(
    "modalclose",
    () => {
      window.removeEventListener("native:keycode", onCode);
      if (isNative())
        void native("captureKey", { enabled: false }).catch(() => {});
    },
    { once: true },
  );
  m.querySelector("#reset-controls")!.addEventListener("click", () => {
    s.eventActions = { ...defaults.eventActions };
    s.hardwareKeys = {};
    for (const k of [
      "tapLayout",
      "longPressDelay",
      "horizontalFling",
      "disableVerticalScroll",
      "orientation",
      "shakeAction",
      "shakeThreshold",
      "shakeTTS",
      "volumeKeys",
      "statusBar",
      "miniStatus",
    ] as const)
      (s as any)[k] = defaults[k];
    changed();
    closeModal();
    perform("controls");
  });
  m.querySelectorAll<HTMLElement>("[data-options-page]").forEach(
    (b) => (b.onclick = () => perform(b.dataset.optionsPage!)),
  );
  searchableOptions(m);
  rangeSteppers(m);
  return m;
}
