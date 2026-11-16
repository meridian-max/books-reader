# Reference-code analysis

Baseline inspected on 2026-11-13; expanded static recovery on 2026-11-14. Target product name: **Books**; platform: **Android**. The requested target is Moon+ Reader/Pro equivalence. Current implementation is an independent reader with substantial overlapping functionality; complete equivalence has not been demonstrated.

Read [the expanded recovery report](../reference/RECOVERY-V2.md) for the latest native pseudocode, alternative Java attempts, exact verification counts, and unresolved work. The earlier sections retain the baseline results and distinguish them from subsequent recovery.

**Pro follow-up on 2026-11-14:** the official developer's regional ARM64 Pro 10.8 APK has now been acquired and statically analyzed separately. See [the Pro report](../reference-pro/ANALYSIS.md) and [Pro verification](../reference-pro/analysis/verification.json). Earlier statements below about having no Pro input describe the free-analysis passes, before this follow-up. The Play-distributed Pro binary and runtime parity remain unverified.

## Evidence and tools

Public product references: [Google Play Pro listing](https://play.google.com/store/apps/details?id=com.flyersoft.moonreaderp&hl=en_IN), [developer website](https://www.moondownload.com/), and the screenshots linked from that listing. The listing identifies v10.8. A free 10.8 APK set was downloaded and installed in the isolated Android emulator. The paid Pro APK was not obtained or tested.

Official reverse-engineering GitHub projects used:

- [skylot/jadx](https://github.com/skylot/jadx), version 1.5.6, source commit `28ff15e4ae69950aebea110a13e5ab895d234dfc`: full base-APK Java decompilation and targeted fallback recovery.
- [iBotPeaches/Apktool](https://github.com/iBotPeaches/Apktool), version 3.0.3, source commit `18b5e99cb56ff9451e8aa55b065dcf5bbd616975`: all six DEX files decoded to smali, plus manifest and resources for all four acquired splits.

Both source repositories are downloaded under `reference/tools/`. Actual execution used the corresponding official release binaries. A JADX source build was attempted: the Java 17 compiler could not load a Java 21+ compiler plugin, and the installed Java 25 runtime had no compiler. Those failed builds are preserved in the logs; the tools are not represented as source-built.

The preserved evidence is under `../reference/`: original APK splits, SHA256SUMS, decoded resources, recovered Java, and tool logs. The APK was signed with certificate CN=Seany Zhou and SHA-256 `5ac646ebc68017e4cc582b11b1c2ae5d29b15d9b0ac3a54fc60972417b41c9ad`. This matched the published APKMirror certificate. It establishes a useful provenance match, not an exhaustive authenticity/security determination.

The earlier targeted activity inspection has now been superseded by a completed full pass. The base APK contains **35,305 DEX class definitions**. An independent inventory was compared with Apktool's `.class` descriptors: all 35,305 matched, with zero missing or extra classes. This establishes class-level disassembly coverage, not semantic equivalence of reconstructed Java.

JADX generated **18,919 Java files**, with exit code 3, **118 errors**, and **570 warnings in 106 nodes**. Inner classes are often combined, so the Java file count is not a coverage percentage. The error report lists 81 method/class problem entries; several errors can belong to one entry. Most listed problems are in bundled libraries. The one listed Flyersoft failure is `MRTextView.mrDrawText`, where type inference exceeded the configured update limit. Increasing the limit did not resolve it. Fallback mode generated the lower-level body, and a separate batch generated 114 files covering all 81 listed problems through 40 outer classes, with zero fallback errors. This does not erase the original Java errors or make fallback output compilable.

Six ARM64 libraries were extracted byte-for-byte from the architecture split, hashed, and disassembled. Symbol tables, ELF dependencies, strings, and ARM64 instructions are preserved. Of 584 Java native method declarations, 523 match named JNI exports. The remaining 61 need additional registration/runtime analysis; a missing named export alone does not prove an absent implementation. Original C/C++ source has not been recovered.

Apktool also decoded 463 base layout XML files, with base, English, and MDPI resources preserved separately. Its unresolved split-resource warnings remain in the logs. These outputs do not reconstruct the developer's original Gradle project, comments, signing key, or unobfuscated names.

## Recovered module map

Paths below are relative to `reference/jadx-full/sources/`. They identify observed code responsibilities, not a claim that every branch was executed.

| Area | Recovered code | Evidence and significance |
| --- | --- | --- |
| Shelf and navigation | `com/flyersoft/moonreader/ActivityMain.java` | Main screens, collections, files, catalogs, and cloud entry points. |
| Reader coordination | `com/flyersoft/moonreader/ActivityTxt.java` | Gesture handling, chapter changes, selection, annotation actions, speech, preferences, and page transitions. |
| Reflow text layout | `com/flyersoft/staticlayout/MRTextView.java`, `MyLayout.java`, `MyHtml.java` | Custom Android text measurement, HTML conversion, line layout, and Canvas rendering. `MRTextView.drawLineHighlight` maps stored ranges onto line geometry. |
| Scrolling and transition cache | `com/flyersoft/views/ScrollView2.java` | Extends Android ScrollView; maintains clipping, translated drawing, cached text views, and transition shadows. Its `computeScroll` delegates to the superclass. |
| Selection UI | `ActivityTxt`, `com/flyersoft/views/HighlightLay.java`, `DotImageView.java` | Selection offsets, handle state, contextual controls, and a magnifier are separate from ordinary page gestures. |
| 3D page animation | `com/flyersoft/views/NewCurl3D.java` | GLSurfaceView renderer with bitmap page shots, textures, and mesh animation. |
| Reflow formats | `com/flyersoft/books/Epub.java`, `Mobi.java`, `Fb2.java`, `Chm.java`, `Umd.java`, `Docx.java`, `Mhtml.java`, `Rtf.java`, `C1548Md.java` | Format-specific chapter/container parsing. Epub includes OPF, NCX/EPUB3 TOC, chapter splitting, CSS caches, and footnote processing. JADX renamed Md to C1548Md; aliases are preserved in the mapping file. |
| PDF | `com/radaee/pdf/Document.java`, `Page.java`, `com/radaee/view/`, `com/flyersoft/books/PDFReader.java` | Java interfaces to native rendering/document operations in `librdpdf.so`. |
| DjVu and native conversion | `org/mydroid/`, `com/dozof/app/MLoader.java` | Native declarations cross-referenced to `libmydjvu.so` and `libmloader.so`. |
| Local persistence | `com/flyersoft/tools/BookDb.java` | `mrbooks.db`: books, notes, covers2, statistics, tmpbooks. Recovered SQL is in `reference/analysis/database-schema.sql`. |
| Cloud and synchronization | `com/flyersoft/components/cloud/Cloud.java`, `Sync.java`, `Dropbox.java`, `Gdrive.java`, `WebDav.java`, `Ftp.java` | Provider routing plus separate position, note, shelf, and book transfer paths. Presence of code does not establish live provider authentication. |
| Highlight export | `com/flyersoft/components/Readwise.java` | Builds a highlights JSON payload and uploads with a configured token. No external requests were made during this analysis. |
| Catalogs | `com/flyersoft/opds/` | Catalog parsing and acquisition interfaces. |
| Background and launcher | `BookTtsService.java`, `BookDownloadService.java`, `com/flyersoft/components/Widget*.java` | Speech/download services and widget data/update paths; manifest inventory records all components. |
| Preferences | `com/flyersoft/moonreader/PrefVisual.java`, `PrefControl.java`, `PrefMisc.java`, `PrefTheme.java`, `PrefShelf.java`, `PrefStatusSetting.java`, `PrefSpeedRead.java` | Separate configuration modules, backed by decoded preference layouts and strings. |

## Scrolling and highlighting findings

`ActivityTxt.initFling` creates a GestureDetector and VelocityTracker, uses the platform maximum fling velocity, and derives deceleration from display density and Android scroll friction. `acceptHorizontalFling` then compares movement direction, distance, velocity, and the configured transition mode. `ScrollView2` retains native scrolling and adds drawing/cache behavior. These observations support keeping Books' touch scroll path free of unnecessary blocking work. They do not establish how fast either app runs on a physical device.

For text annotations, `ActivityTxt.createDotNoteInfo` records the current chapter, split index, selection start, selection length, selected text, style/color, and timestamp. Plain text offsets are translated through `getTxtRealPos`; reflowed books use the selected view's offset. `doHighlight2` updates an existing note or inserts a new one, clears the transient selection, invalidates the text view, and resets page-transition caches. PDF and DjVu take separate branches. `MRTextView` paints highlight ranges against its own line layout. Relevant Java locations in this recovered version are `ActivityTxt.java:12524`, `:19969`, `:20040`, and `MRTextView.java:2101`; matching smali is preserved even where Java reconstruction is uncertain.

Books uses EPUB CFI/range anchors and browser selection in its WebView/Foliate engine. The recovered Moon+ Reader range offsets and rendering classes therefore cannot be dropped into Books as a smoothness or highlighting fix. They provide concrete behavior to compare: stable anchors, handle dragging, edit versus insert, persistence, cache invalidation, and separate PDF/DjVu behavior. No new Books implementation or performance result is claimed from this analysis pass.

## Artifacts and verification

- `reference/jadx-full/sources/`: full high-level Java output and its warnings.
- `reference/jadx-fallback/sources/`: lower-level output for all listed problematic entries, including `mrDrawText`.
- `reference/apktool-full/`: all decoded splits and complete DEX smali output.
- `reference/analysis/native/`: native symbol tables, ELF metadata, strings, and disassembly.
- `reference/analysis/verification.json`: checked class coverage, native extraction integrity, resource counts, and fallback coverage.
- `reference/analysis/decompilation-problems.json`: original high-level failure inventory.
- `reference/analysis/native-crossrefs.csv`: JNI declaration/export mapping.
- `reference/analysis/REPRODUCE.md`: versions and commands used.

This is a static reverse-engineering pass plus the earlier limited emulator inspection. It does not include execution of every feature, exhaustive call-graph tracing, native algorithm reconstruction, or a rebuild of Moon+ Reader. The paid Pro binary was not part of the input, and complete Pro parity remains unverified.

## Findings applied to Books

`ActivityMain` coordinates the main navigation, collection filtering, imported books, recently opened books, file views, catalog flows, and cloud operations. The decoded `drawer_left.xml`, `main_base_v35.xml`, `shelf_grid_item.xml`, and `shelf_list_item.xml` expose the compact app bar, drawer structure, cover/title/author/rating/progress arrangement, and separate shelf modes. This led to replacing the initial custom dashboard with Recent list, My Shelf, My Files, Net Library, and Bookmarks navigation, a title selector, filters, overflow menu, and Continue Reading button.

`ActivityTxt` combines reader navigation, input actions, selection, annotation panels, TTS, theme application, and page-animation controls. Resources such as `pref_visual.xml`, `pref_control.xml`, and `pref_misc.xml` make the option grouping explicit. Books now has separate Visual Options, Control Options, Miscellaneous, and Themes menus, configurable action mapping, a compact reader bar, selection styles/colors, saved visual presets, and speech controls. The recovered class also confirms that the reference has specialized branches and additional fine-grained settings that are not all represented by the Play description.

The implementation deliberately uses a different engine architecture: Android Java hosts an offline WebView reader; Foliate handles reflow, MuPDF and djvu-rs run in workers, and Java jchmlib handles CHM containers. Consequently source-level similarity is neither expected nor claimed. The user-visible target remains the reference workflows, while tests evaluate actual reading, persistence, native integrations, and exported files.

## Reusable GitHub code actually included

- [johnfactotum/foliate-js](https://github.com/johnfactotum/foliate-js), MIT, revision `78914aef4466eb960965702401634c2cb348e9b1`.
- [chimenchen/jchmlib](https://github.com/chimenchen/jchmlib), Apache-2.0, revision `7cb19cd178a47058cacabb88bd8652d64bac2146`; changes add resource cleanup, container bounds checks, uncompressed support fixes, and proper metadata-file enumeration.
- [flyfish-dev/file-viewer](https://github.com/flyfish-dev/file-viewer/blob/d264009ca6efb3daed79a39d1ae63133e0f25558/packages/renderers/ebook/src/umd/parser.ts), Apache-2.0; UMD parser adapted to fflate with English messages and input size checks.
- [matyushkin/djvu-rs](https://github.com/matyushkin/djvu-rs), MIT, npm `0.45.0`, offline WASM decoder.
- [ArtifexSoftware/mupdf](https://github.com/ArtifexSoftware/mupdf), AGPL-3.0-or-later, npm `1.28.6`, npm gitHead `da5f5eb890d7b3fb76903160b5f7f48ba1301492`; PDF engine.

No verified original Moon+ Reader source repository was located in the searches performed. Third-party repositories with no clear reuse license were not incorporated. Moon+ Reader's decompiled Java and resource assets are inspection references, excluded from the shipping Books assets and source archive.

## What the evidence does not establish

The free reference build and public descriptions do not prove the exact behavior of every Pro branch. There is no full screenshot-difference suite across every setting, device, theme, locale, and document variant. The existing hardware/emulator and provider test boundaries are listed in FEATURE-COVERAGE.md. A claim of “100% the same UI and every feature” would therefore be inaccurate for this build.

## Version 1.0 follow-through

The second implementation pass added rich DOCX rendering (Apache-2.0 docx-preview), ODT tables/styles/images, MHTML MIME resources/styles, a native full-book TTS queue, real screen-off chapter progression, native all-files access and cross-provider file operations, PDF save to original source, live text processing, zoom/mini-status options, real-time auto-scroll controls, automatic cloud position sync, authenticated OPDS/search/acquisition, Downloads and bulk library actions, twelve main-interface language dictionaries, and configurable cover widgets. A real launcher widget and pinned book shortcut were installed and used to open the matching book. None of these changes incorporate proprietary reference Java or assets.

## Version 1.0.1 interaction audit

ActivityTxt.initFling, highlightText and initHighlightViews were inspected again alongside the Books input and annotation flows. The original separates fling velocity/friction, selection offsets, handle dragging and its highlight bar. Books now separates native scroll/selection and page input, tracks selection changes, preserves saved marks during speech, serializes opening/highlight work, and avoids repeated whole-UI localization scans. See SCROLL-AND-SELECTION.md for implementation and evidence.

## Expanded reverse engineering on 2026-11-14

Scanning every APK entry found two additional compiled MOBI assets, so the native inventory now covers **eight ELF inputs**, each verified against its original APK entry. Locally extracted official Radare2/r2ghidra 6.2.6 packages generated native pseudocode for all recognized non-import function jobs: **11,834 attempted, 11,817 bodies generated, 17 failures** in the automatic pass. Of those bodies, 6,109 contain warnings and 271 have unsettled type-propagation warnings; generated output is not semantic recovery or compilable original C/C++.

The JNI analysis now statically associates **560/584 declarations**: 545 named-export matches and 15 unique name/signature candidates in registration tables. All 584 Java-derived JNI prototypes pass a C syntax check. The 24 unresolved declarations and their static call sites remain listed. Runtime registration and all provider branches are not established by these matches.

Independent CFR and Vineflower experiments processed 315 DEX class definitions in the 40 problematic outer families. Each emitted 41 source files with warnings/failure markers. Enjarify was also tested on MRTextView. None produced a clean structured `mrDrawText` method. Instead, its complete **952-instruction, 287-block, 463-edge, 60-exception-region** smali control-flow map was extracted and checked for complete instruction assignment and valid branch targets.

A PDF decompiler boundary error was traced to calls that never return. One 156-byte helper initially generated 411,604 bytes of misleading pseudocode; explicit analysis annotations reduced it to 1,267 bytes and removed its unsettled type warning. Six initial helper/throw annotations plus ten constrained straight-line wrapper inferences were used in a separate targeted PDF pass. The automatic evidence, failed attempts, inferred addresses, and before/after measurements are retained rather than overwritten.

That targeted pass completed 277 jobs, generated 272 bodies, and retained 5 failures. It recovered bodies for ten previously failed PDF entries. Across both native passes, 11,827 distinct addresses have generated bodies and seven still do not. Among the selected PDF outputs, unsettled type-propagation markers changed from 254 to 166; this is a decompiler-output measurement, not a correctness guarantee.

The upstream libmobi repository was also acquired at a pinned revision, with its source/license. Matching `mobi_*` APIs identify it as a relevant backend candidate; its exact correspondence to the shipped binary revision is unknown. This is not the original Moon+ Reader application project.

The detailed outputs and checks are in `reference/RECOVERY-V2.md` and `reference/analysis/recovery-v2-verification.json`. The local archive `releases/MoonReader-10.8-recovery-v2.tar.gz` contains the completed inspection workspace and reproducible tool packages/sources; its verification report checks important files by reading the archive back. These materials are kept out of Books' shipping assets and source distribution. This pass did not modify Books 1.0.2, acquire the paid Pro binary, rebuild Moon+ Reader, or establish 100% UI/feature equality.
