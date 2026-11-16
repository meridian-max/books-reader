# Third-party notices

Books original application code is licensed under AGPL-3.0-or-later. The full license is in LICENSE. Dependencies retain their own licenses. License texts are bundled in `public/licenses/` and the APK. The reference application's code/assets are not included in the shipping app or source archive.

| Component | Version / revision | License / source |
|---|---|---|
| docx-preview | `0.4.1` | Apache-2.0; https://github.com/VolodymyrBaydalka/docxjs |
| JSZip | lockfile-pinned | MIT; https://github.com/Stuk/jszip |
| Foliate JS | `78914aef4466eb960965702401634c2cb348e9b1` | MIT; https://github.com/johnfactotum/foliate-js; modified source included in `vendor/foliate-js`; local changes are listed in its BOOKS-MODIFICATIONS.md |
| Readest Foliate patterns | `22a49acaa120877ede21f713679ab8ba4d1ef663` | MIT; https://github.com/readest/foliate-js; bounded progress reporting and scoped input-ownership patterns adapted in Books 1.1.2; single-section touch-boundary logic adapted in 1.1.3; same Foliate MIT copyright/license bundled |
| MuPDF | npm `1.28.6`; gitHead `da5f5eb890d7b3fb76903160b5f7f48ba1301492` | AGPL-3.0-or-later; https://github.com/ArtifexSoftware/mupdf/tree/da5f5eb890d7b3fb76903160b5f7f48ba1301492/platform/wasm; upstream source includes third-party submodules |
| djvu-rs | npm `0.45.0` | MIT; https://github.com/matyushkin/djvu-rs/tree/v0.45.0; dependency notices also bundled |
| jchmlib | `7cb19cd178a47058cacabb88bd8652d64bac2146` | Apache-2.0; https://github.com/chimenchen/jchmlib; modified source included in Android Java tree; modifications described in REFERENCE-ANALYSIS |
| Flyfish UMD parser | `d264009ca6efb3daed79a39d1ae63133e0f25558` | Apache-2.0; https://github.com/flyfish-dev/file-viewer; adapted source in `src/umd.ts`; attribution in `public/licenses/Flyfish-UMD.txt` |
| libarchive.js | `2.0.2` | MIT wrapper; underlying libarchive has its upstream BSD-style notices in the package; https://github.com/nika-begiashvili/libarchivejs |
| DOMPurify | `3.4.17` | Apache-2.0 OR MPL-2.0; https://github.com/cure53/DOMPurify |
| fflate | `0.8.3` | MIT; https://github.com/101arrowz/fflate |
| Marked | `15.0.12` | MIT; https://github.com/markedjs/marked |
| Lucide | `0.468.0` | ISC; https://github.com/lucide-icons/lucide; includes icon attributions in package license |
| idb | `8.0.3` | ISC; https://github.com/jakearchibald/idb |
| AndroidX WebKit | `1.12.1` | Apache-2.0; https://android.googlesource.com/platform/frameworks/support/+/androidx-main/webkit/ |
| DejaVu Serif | bundled reader font | Bitstream/DejaVu license; full text in `public/licenses/DejaVu.txt`; https://dejavu-fonts.github.io/ |

The four sample EPUB files were downloaded from Project Gutenberg: Alice's Adventures in Wonderland (11), Pride and Prejudice (1342), The Adventures of Sherlock Holmes (1661), and Frankenstein (84). The EPUBs retain their embedded Gutenberg notices. https://www.gutenberg.org/

The DjVu fixture is used only for verification; attribution is in `tests/fixtures/DJVU-ATTRIBUTION.md`. Other synthetic document fixtures were authored for Books tests. JADX and Apktool are inspection tools, not runtime dependencies; their original GitHub repositories are linked in REFERENCE-ANALYSIS.md.

## Apache Commons Net 3.13.0

FTP/FTPS transport. Copyright The Apache Software Foundation, licensed under Apache-2.0. Full license and NOTICE are included in `public/licenses/Apache-Commons-Net.txt`. Source: https://commons.apache.org/proper/commons-net/

## Manrope

Interface typeface from https://github.com/google/fonts/tree/main/ofl/manrope. SIL Open Font License 1.1; bundled in `public/licenses/Manrope.txt`.

## Bundled reading font library (1.5.0)

Literata, Lora, Merriweather, Crimson Pro, EB Garamond, Source Serif 4, Noto Serif, Atkinson Hyperlegible Next, Lexend, Noto Sans, Open Sans, Noto Serif Devanagari and Noto Sans Devanagari are distributed under SIL Open Font License 1.1. Unmodified font files and their original license texts are bundled in `public/fonts/` and `public/licenses/`. Exact official google/fonts download URLs, source Git blob hashes and sizes are recorded in `public/fonts/SOURCES.json`. Manrope and DejaVu notices above continue to apply. Typeface names identify the original fonts; no font authors endorse Books.

## Offline speech — optional model download from 1.6.1

- **Kokoro-82M v1.0**, int8 multilingual conversion: Apache-2.0, https://huggingface.co/hexgrad/Kokoro-82M . Model and speaker embeddings are unmodified from the pinned sherpa-onnx model archive. Its updated 54-entry speaker table is retained; Books exposes 49 speakers, excluding Japanese because this frontend does not provide Japanese phonemization. Model license: `public/licenses/Kokoro.txt`.
- **sherpa-onnx v1.12.40**: Apache-2.0, https://github.com/k2-fsa/sherpa-onnx/tree/v1.12.40 . Unmodified official Android AAR; its source archive, build recipes and dependency pins are included in `vendor/voices/sherpa-onnx-1.12.40-source.tar.gz`. License: `public/licenses/Sherpa-ONNX.txt`.
- **eSpeak NG**, csukuangfj revision `f6fed6c58b5e0998b8e68c6610125e2d07d595a7`: GPL-3.0-or-later. Source with build scripts and its dependency code is included in `vendor/voices/espeak-ng-f6fed6c58b5e0998b8e68c6610125e2d07d595a7-source.zip`. License: `public/licenses/eSpeak-NG.txt`. Used for phonemization, not as the audible voice.
- **piper-phonemize**, csukuangfj revision `78a788e0b719013401572d70fef372e77bff8e43`: MIT; source included in `vendor/voices/piper-phonemize-78a788e0b719013401572d70fef372e77bff8e43-source.zip`. License: `public/licenses/Piper-phonemize.txt`.
- **ONNX Runtime 1.24.3** (version embedded in the official AAR's ARM64 library): MIT, https://github.com/microsoft/onnxruntime/tree/v1.24.3 . Full upstream license and third-party notices are included in `public/licenses/ONNX-Runtime.txt`.

Books' original engine integration is AGPL-3.0-or-later and included in the accompanying source distribution. `scripts/fetch-voices.py` records the exact official download URLs and SHA-256 checks for restoring runtime/model assets. Native upstream build instructions are in the bundled sherpa source, `android/SherpaOnnxAar/README.md` and its release workflows. No voice is intended to represent a named real person. Speaker names are the upstream model's labels.

## Optional voice pack extraction — 1.6.1

Apache Commons Compress 1.28.0, Commons IO 2.21.0, Commons Codec 1.19.0 and Commons Lang 3.18.0 are Apache-2.0 licensed. Original LICENSE and NOTICE files from the resolved JARs are included in `public/licenses/Apache-Commons-{Compress,IO,Codec,Lang}.txt`. Sources: https://commons.apache.org/proper/commons-compress/ , https://commons.apache.org/proper/commons-io/ , https://commons.apache.org/proper/commons-codec/ , https://commons.apache.org/proper/commons-lang/ .

The APK includes the native inference runtime and phonemizer code. Model, speaker embeddings and phonemizer data are fetched only after the user taps Download voices; they are not included in the 1.6.1 APK. The official model archive is verified against the pinned SHA-256 before extraction.
