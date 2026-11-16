import * as m from "./engines/mupdf/mupdf.js";
let doc;
function annotationId(annotation) {
  const object = annotation.getObject(), value = object.get("NM");
  try { return value.asString() || value.asName(); }
  finally { value.destroy(); object.destroy(); }
}
function setAnnotationId(annotation, id) {
  const object = annotation.getObject(), value = doc.newString(String(id));
  try { object.put("NM", value); }
  finally { value.destroy(); object.destroy(); }
}
const methods = {
  open: ({ buffer, password }) => {
    if (doc) doc.destroy();
    doc = m.Document.openDocument(buffer, "application/pdf");
    if (doc.needsPassword() && !doc.authenticatePassword(password || ""))
      return { password: true };
    return {
      count: doc.countPages(),
      toc: doc.loadOutline() || [],
      title: doc.getMetaData("info:Title"),
      author: doc.getMetaData("info:Author"),
    };
  },
  render: ({ page, width }) => {
    const p = doc.loadPage(page);
    try {
      const bounds = p.getBounds();
      const scale = Math.min(width / (bounds[2] - bounds[0]), 3);
      const pix = p.toPixmap(
        m.Matrix.scale(scale, scale),
        m.ColorSpace.DeviceRGB,
        false,
        true,
      );
      try {
        const stext = p.toStructuredText("preserve-whitespace");
        let text;
        try {
          text = JSON.parse(stext.asJSON());
        } finally {
          stext.destroy();
        }
        const widgets = p.getWidgets().map((w, i) => {
          try {
            return {
              i,
              type: w.getFieldType(),
              name: w.getName(),
              value: w.getValue(),
              bounds: w.getBounds(),
              options: w.isChoice() ? w.getOptions() : [],
              readonly: w.isReadOnly(),
            };
          } finally {
            w.destroy();
          }
        });
        return { png: pix.asPNG(), bounds, text, widgets };
      } finally {
        pix.destroy();
      }
    } finally {
      p.destroy();
    }
  },
  text: ({ page }) => {
    const p = doc.loadPage(page);
    try {
      const text = p.toStructuredText();
      try {
        return { text: text.asText() };
      } finally {
        text.destroy();
      }
    } finally {
      p.destroy();
    }
  },
  search: ({ query }) => {
    const out = [];
    for (let i = 0; i < doc.countPages(); i++) {
      const p = doc.loadPage(i);
      try {
        const result = p.search(query);
        if (result.length) out.push({ page: i, quads: result });
        if (out.length >= 200) break;
      } finally {
        p.destroy();
      }
    }
    return out;
  },
  annotate: ({ page, type, rect, quads, points, text, color, id }) => {
    const p = doc.loadPage(page);
    try {
      const a = p.createAnnotation(type);
      try {
        a.setColor(color || [1, 0.8, 0.2]);
        if (id) setAnnotationId(a, id);
        if (rect) a.setRect(rect);
        if (quads) a.setQuadPoints(quads);
        if (points) {
          a.setInkList([points]);
          a.setBorderWidth(2);
        }
        if (text) a.setContents(text);
        if (type === "FreeText")
          a.setDefaultAppearance("Helv", 14, [0.1, 0.1, 0.1]);
        a.update();
      } finally {
        a.destroy();
      }
    } finally {
      p.destroy();
    }
    return true;
  },
  deleteAnnotation: ({ page, id, index }) => {
    const p = doc.loadPage(page);
    try {
      const list = p.getAnnotations();
      try {
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          if (id ? annotationId(a) === id : i === index) {
            p.deleteAnnotation(a);
            break;
          }
        }
      } finally {
        for (const a of list) a.destroy();
      }
    } finally {
      p.destroy();
    }
    return true;
  },
  editAnnotation: ({ page, id, index, text, color, type }) => {
    const p = doc.loadPage(page);
    try {
      const list = p.getAnnotations();
      try {
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          if (id ? annotationId(a) === id : i === index) {
            const styles = ["Highlight", "Underline", "StrikeOut", "Squiggly"];
            if (type && type !== a.getType() && styles.includes(type) && styles.includes(a.getType())) {
              const replacement = p.createAnnotation(type);
              try {
                replacement.setQuadPoints(a.getQuadPoints());
                replacement.setColor(color || a.getColor());
                replacement.setOpacity(a.getOpacity());
                replacement.setContents(text ?? a.getContents());
                setAnnotationId(replacement, id || annotationId(a));
                replacement.update();
                p.deleteAnnotation(a);
              } finally { replacement.destroy(); }
            } else {
              if (id) setAnnotationId(a, id);
              if (text !== undefined) a.setContents(text);
              if (color) a.setColor(color);
              a.update();
            }
            break;
          }
        }
      } finally {
        for (const a of list) a.destroy();
      }
    } finally {
      p.destroy();
    }
    return true;
  },
  annotations: () => {
    const out = [];
    for (let page = 0; page < doc.countPages(); page++) {
      const p = doc.loadPage(page);
      try {
        const list = p.getAnnotations();
        try {
          list.forEach((a, index) =>
            out.push({
              page,
              index,
              id: annotationId(a),
              type: a.getType(),
              text: a.getContents(),
              bounds: a.getBounds(),
            }),
          );
        } finally {
          for (const a of list) a.destroy();
        }
      } finally {
        p.destroy();
      }
    }
    return out;
  },
  field: ({ page, index, value }) => {
    const p = doc.loadPage(page);
    try {
      const list = p.getWidgets();
      try {
        const w = list[index];
        if (w.isReadOnly()) throw Error("This form field is read only.");
        if (w.isCheckbox() || w.isRadioButton()) w.toggle();
        else if (w.isText()) w.setTextValue(value);
        else if (w.isChoice()) w.setChoiceValue(value);
        w.update();
      } finally {
        for (const w of list) w.destroy();
      }
    } finally {
      p.destroy();
    }
    return true;
  },
  save: () => {
    const b = doc.saveToBuffer("garbage=3,compress");
    try {
      return b.asUint8Array().slice();
    } finally {
      b.destroy();
    }
  },
  close: () => {
    doc?.destroy();
    doc = null;
  },
};
self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    const data = await methods[method](args || {});
    self.postMessage({ id, ok: true, data });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e.message });
  }
};
self.postMessage({ ready: true });
