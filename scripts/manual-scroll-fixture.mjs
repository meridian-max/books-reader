import {zipSync, strToU8} from 'fflate';

export function manualScrollBook() {
  const files = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'book.opf': strToU8('<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">manual-scroll-regression</dc:identifier><dc:title>Manual scrolling</dc:title><dc:language>en</dc:language></metadata><manifest>'+[0,1,2,3].map(i=>`<item id="s${i}" href="${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')+'</manifest><spine><itemref idref="s0"/><itemref idref="s1" linear="no"/><itemref idref="s2"/><itemref idref="s3"/></spine></package>'),
  };
  for (const i of [0,1,2,3]) files[`${i}.xhtml`] = strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Section '+i+'</title></head><body><h1>Section '+i+'</h1>'+Array.from({length:i===2?1:80},(_,p)=>`<p>Passage ${i}.${p}. Mira read by the window. The story continued with another thought and a new adventure.</p>`).join('')+(i===2?'':'<div id="nested" style="height:100px;overflow-y:auto"><p style="height:900px;margin:0">Nested scrolling region</p></div>')+'</body></html>');
  return zipSync(files,{mtime:new Date('2026-01-01T00:00:00Z')});
}
