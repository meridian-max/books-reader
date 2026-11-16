import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir("public/engines", { recursive: true });
await cp("node_modules/djvu-rs", "public/engines/djvu", {
  recursive: true,
  filter: (path) => !path.endsWith(".d.ts"),
});
await cp("node_modules/mupdf/dist", "public/engines/mupdf", {
  recursive: true,
  filter: (p) => !p.endsWith(".br") && !p.endsWith(".d.ts"),
});
await cp("node_modules/libarchive.js/dist", "public/engines/archive", {
  recursive: true,
});
await mkdir("public/foliate", { recursive: true });
for (const f of await (
  await import("node:fs/promises")
).readdir("vendor/foliate-js"))
  if (f.endsWith(".js"))
    await cp("vendor/foliate-js/" + f, "public/foliate/" + f);
await cp("vendor/foliate-js/vendor", "public/foliate/vendor", {
  recursive: true,
});
const licenses = [
  ["Docx-preview", "node_modules/docx-preview/LICENSE"],
  ["JSZip", "node_modules/jszip/LICENSE.markdown"],
  ["djvu-rs", "node_modules/djvu-rs/LICENSE"],
  ["djvu-rs-dependencies", "node_modules/djvu-rs/THIRD_PARTY_NOTICES"],
  ["Foliate", "vendor/foliate-js/LICENSE"],
  ["MuPDF", "node_modules/mupdf/LICENSE"],
  ["Libarchive.js", "node_modules/libarchive.js/LICENSE"],
  ["DOMPurify", "node_modules/dompurify/LICENSE"],
  ["fflate", "node_modules/fflate/LICENSE"],
  ["Marked", "node_modules/marked/LICENSE.md"],
  ["Lucide", "node_modules/lucide/LICENSE"],
  ["idb", "node_modules/idb/LICENSE"],
];
await mkdir("public/licenses", { recursive: true });
for (const [name, path] of licenses) {
  try {
    await cp(path, "public/licenses/" + name + ".txt");
  } catch {}
}
await writeFile(
  "public/licenses/foliate-revision.txt",
  await readFile("vendor/foliate-js/BOOKS-UPSTREAM-REVISION", "utf8"),
);
