import { writeFile, mkdir } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
await mkdir("tests/fixtures", { recursive: true });
await writeFile(
  "tests/fixtures/story.txt",
  "A quiet beginning\n\n" +
    Array.from(
      { length: 35 },
      (_, i) =>
        `Chapter ${i + 1}\n\nThe reading room was full of light. Mira opened her book and discovered a new world between its pages. Every story offered a different road, and every road led to a little more understanding. She read slowly, keeping the sentences that mattered.\n\n`,
    ).join(""),
);
const xml =
  '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>A test document</w:t></w:r></w:p><w:p><w:r><w:t>A small Word document to verify real file import.</w:t></w:r></w:p></w:body></w:document>';
await writeFile(
  "tests/fixtures/office.docx",
  zipSync({
    "word/document.xml": strToU8(xml),
    "[Content_Types].xml": strToU8("<Types/>"),
  }),
);
await writeFile(
  "tests/fixtures/office.odt",
  zipSync({
    "content.xml": strToU8(
      '<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h>A test document</text:h><text:p>A small OpenDocument to verify real file import.</text:p></office:text></office:body></office:document-content>',
    ),
  }),
);
await writeFile(
  "tests/fixtures/story.md",
  "# A quiet beginning\n\nA markdown **reader** with a [footnote](#note).\n\n## The next chapter\n\nA small story.",
);
await writeFile(
  "tests/fixtures/story.rtf",
  "{\\rtf1\\ansi{\\fonttbl{\\f0 Times;}}\\f0 A quiet beginning\\par A small RTF document with \\b bold\\b0 text.\\par The next chapter.}",
);
await writeFile(
  "tests/fixtures/unsafe.html",
  '<!doctype html><html><head><title>Unsafe book fixture</title><script>window.__bookExecuted=true;parent.__bookExecuted=true</script></head><body><h1>Safe reading</h1><p onclick="parent.__bookExecuted=true">This book contains a script that must never run.</p><script src="/dangerous.js"></script><iframe srcdoc="<script>parent.__bookExecuted=true</script>"></iframe></body></html>',
);
const content =
  "BT /F1 22 Tf 45 650 Td (A quiet beginning) Tj 0 -40 Td /F1 13 Tf (This PDF contains real selectable text.) Tj 0 -25 Td (Every reader deserves a good story.) Tj ET";
const objects = [
  "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [7 0 R] /DR << /Font << /F1 4 0 R >> >> /DA (/F1 12 Tf 0 g) >> >>",
  "<< /Type /Pages /Kids [3 0 R 8 0 R] /Count 2 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 700] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [7 0 R] >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream",
  "<< /Length 0 >>\nstream\n\nendstream",
  "<< /Type /Annot /Subtype /Widget /FT /Tx /T (reader_name) /V (Mira) /DA (/F1 12 Tf 0 g) /Rect [45 500 250 530] /P 3 0 R /F 4 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 700] /Resources << /Font << /F1 4 0 R >> >> /Contents 9 0 R >>",
  "<< /Length 72 >>\nstream\nBT /F1 20 Tf 45 650 Td (The next chapter begins on the second page.) Tj ET\nendstream",
];
let pdf = "%PDF-1.7\n",
  offsets = [0];
for (let i = 0; i < objects.length; i++) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += i + 1 + " 0 obj\n" + objects[i] + "\nendobj\n";
}
const xref = Buffer.byteLength(pdf);
pdf +=
  "xref\n0 " +
  (objects.length + 1) +
  "\n0000000000 65535 f \n" +
  offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("") +
  "trailer\n<< /Size " +
  (objects.length + 1) +
  " /Root 1 0 R >>\nstartxref\n" +
  xref +
  "\n%%EOF";
await writeFile("tests/fixtures/reading.pdf", pdf);
// A small, valid, uncompressed CHM container authored for the import test.
const cword = (n) => {
  const parts = [n & 127];
  while (n >= 128) {
    n = Math.floor(n / 128);
    parts.unshift((n & 127) | 128);
  }
  return Buffer.from(parts);
};
const record = (type, value) => {
  const data = Buffer.from(value + "\0");
  const header = Buffer.alloc(4);
  header.writeUInt16LE(type);
  header.writeUInt16LE(data.length, 2);
  return Buffer.concat([header, data]);
};
const system = Buffer.concat([
  Buffer.from([3, 0, 0, 0]),
  record(2, "index.html"),
  record(3, "Books CHM fixture"),
  record(0, "contents.hhc"),
]);
const chmFiles = {
  "/#SYSTEM": system,
  "/index.html": Buffer.from(
    '<html><body><h1>A quiet beginning</h1><p>A real CHM document opens offline in Books.</p><a href="chapter2.html">Next chapter</a></body></html>',
  ),
  "/chapter2.html": Buffer.from(
    "<html><body><h1>The second chapter</h1><p>The CHM table of contents and document links work.</p></body></html>",
  ),
  "/contents.hhc": Buffer.from(
    '<ul><li><object type="text/sitemap"><param name="Name" value="A quiet beginning"><param name="Local" value="index.html"></object></li><li><object type="text/sitemap"><param name="Name" value="The second chapter"><param name="Local" value="chapter2.html"></object></li></ul>',
  ),
};
let start = 0;
const chmEntries = [];
for (const [name, bytes] of Object.entries(chmFiles)) {
  const path = Buffer.from(name);
  chmEntries.push(
    Buffer.concat([
      cword(path.length),
      path,
      cword(0),
      cword(start),
      cword(bytes.length),
    ]),
  );
  start += bytes.length;
}
const directory = Buffer.concat(chmEntries),
  itsf = Buffer.alloc(96),
  itsp = Buffer.alloc(84),
  pmgl = Buffer.alloc(4096);
itsf.write("ITSF");
itsf.writeUInt32LE(3, 4);
itsf.writeUInt32LE(96, 8);
itsf.writeUInt32LE(0x409, 20);
itsf.writeBigUInt64LE(96n, 72);
itsf.writeBigUInt64LE(4180n, 80);
itsf.writeBigUInt64LE(4276n, 88);
itsp.write("ITSP");
itsp.writeUInt32LE(1, 4);
itsp.writeUInt32LE(84, 8);
itsp.writeUInt32LE(4096, 16);
itsp.writeInt32LE(-1, 28);
itsp.writeUInt32LE(0, 32);
itsp.writeUInt32LE(0x409, 48);
pmgl.write("PMGL");
pmgl.writeUInt32LE(4096 - 20 - directory.length, 4);
pmgl.writeInt32LE(-1, 12);
pmgl.writeInt32LE(-1, 16);
directory.copy(pmgl, 20);
await writeFile(
  "tests/fixtures/reading.chm",
  Buffer.concat([itsf, itsp, pmgl, ...Object.values(chmFiles)]),
);

// Original UMD text fixture: UTF-16LE chapter content compressed with zlib.
const { deflateSync } = await import("node:zlib");
const u16 = (text) => Buffer.from(text, "utf16le");
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const umdSection = (type, data = Buffer.alloc(0)) =>
  Buffer.concat([
    Buffer.from([0x23, type & 255, type >> 8, 0, data.length + 5]),
    data,
  ]);
const umdData = (check, data) =>
  Buffer.concat([Buffer.from([0x24]), u32(check), u32(data.length + 9), data]);
const umdText = u16(
  "A quiet UMD beginning\u2029A real compressed UMD book opens offline in Books.\u2029The second chapter\u2029Its chapter links and text work.",
);
await writeFile(
  "tests/fixtures/reading.umd",
  Buffer.concat([
    u32(0xde9a9b89),
    umdSection(1, Buffer.from([1, 1, 0])),
    umdSection(2, u16("Books UMD fixture")),
    umdSection(3, u16("Books test author")),
    umdSection(11, u32(umdText.length)),
    umdSection(0x83, u32(7)),
    umdData(
      7,
      Buffer.concat([
        u32(0),
        u32(
          u16(
            "A quiet UMD beginning\u2029A real compressed UMD book opens offline in Books.\u2029",
          ).length,
        ),
      ]),
    ),
    umdSection(0x84, u32(8)),
    umdData(
      8,
      Buffer.concat([
        Buffer.from([u16("A quiet beginning").length]),
        u16("A quiet beginning"),
        Buffer.from([u16("The second chapter").length]),
        u16("The second chapter"),
      ]),
    ),
    umdData(9, deflateSync(umdText)),
  ]),
);

// Standards-based document fixtures with tables, formatting, and embedded artwork.
const artwork = strToU8(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="40"><rect width="64" height="40" fill="#d34132"/></svg>',
);
const odtNamespaces =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink"';
await writeFile(
  "tests/fixtures/rich.odt",
  zipSync({
    mimetype: strToU8("application/vnd.oasis.opendocument.text"),
    "content.xml": strToU8(
      `<office:document-content ${odtNamespaces}><office:automatic-styles><style:style style:name="Strong" style:family="text"><style:text-properties fo:font-weight="bold" fo:color="#c00000"/></style:style></office:automatic-styles><office:body><office:text><text:h text:outline-level="1">Rich ODT document</text:h><text:p>Keep <text:span text:style-name="Strong">bold red text</text:span> and inline spacing.</text:p><table:table><table:table-row><table:table-cell><text:p>Left cell</text:p></table:table-cell><table:table-cell><text:p>Right cell</text:p></table:table-cell></table:table-row></table:table><text:p><draw:frame><draw:image xlink:href="Pictures/art.svg"/></draw:frame></text:p></office:text></office:body></office:document-content>`,
    ),
    "Pictures/art.svg": artwork,
  }),
);
const wordNs =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
await writeFile(
  "tests/fixtures/rich.docx",
  zipSync({
    "[Content_Types].xml": strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/_rels/document.xml.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/art.svg"/></Relationships>',
    ),
    "word/styles.xml": strToU8(
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>',
    ),
    "word/document.xml": strToU8(
      `<w:document ${wordNs}><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Rich Word document</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Bold italic passage</w:t></w:r></w:p><w:tbl><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Left cell</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Right cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><wp:inline><wp:extent cx="609600" cy="381000"/><wp:docPr id="1" name="Artwork"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="art.svg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="609600" cy="381000"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:bottom="720" w:left="720" w:right="720"/></w:sectPr></w:body></w:document>`,
    ),
    "word/media/art.svg": artwork,
  }),
);
await writeFile(
  "tests/fixtures/embedded.mhtml",
  `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="BOOKS-MIME"\r\n\r\n--BOOKS-MIME\r\nContent-Type: text/html; charset=utf-8\r\nContent-Location: https://example.invalid/book/index.html\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<html><head><title>Archived book</title><link rel=3D"stylesheet" href=3D"assets/style.css"></head><body><h1>Archived page</h1><p class=3D"special">Offline artwork and stylesheet.</p><img src=3D"cid:artwork"></body></html>\r\n--BOOKS-MIME\r\nContent-Type: text/css\r\nContent-Location: https://example.invalid/book/assets/style.css\r\n\r\n.special{color:rgb(190,20,30)}\r\n--BOOKS-MIME\r\nContent-Type: image/svg+xml\r\nContent-ID: <artwork>\r\nContent-Location: https://example.invalid/book/assets/art.svg\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(artwork).toString("base64")}\r\n--BOOKS-MIME--\r\n`,
);
await writeFile(
  "tests/fixtures/nested-books.zip",
  zipSync({
    "nested.zip": zipSync({
      "reading.md": strToU8(
        "# Nested book\n\nA nested archive opens as a real book.",
      ),
    }),
  }),
);
