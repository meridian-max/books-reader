# Books preview coverage

**Current release: 1.7.0.** See [the screenshot feature matrix](REFERENCE-OPTIONS-1.7.0.md) and [release checks](RELEASE-1.7.0.md). The older sections below are historical where superseded.

Earlier 1.4.0 additions: downloaded design-skill guidance, CRED-inspired graphite surfaces, dimensional covers, bundled Manrope typography, a reading-profile pass, and brief action feedback.  Home/Library/Notes/You navigation, optional interface animations with reduced-motion support, editable local profile, reading-history search, goals/streaks and Google Drive full-snapshot backup/restore code. Google Cloud project creation and Drive API enablement are verified; OAuth setup and real Google sign-in/Drive acceptance remain pending. The preview's Google client ID is intentionally blank. See [current validation](RELEASE-1.4.0.md). The table below retains earlier feature evidence; its older provider and UI boundaries are superseded by this paragraph for 1.4.0.

This release implements the major reader workflows and has passed the recorded browser and Android checks. It is **an independent implementation, with remaining differences from Moon+ Reader**. This is the status of the code delivered here, based on local tests and inspection—not an assertion that every file variant, device, or external provider works.

| Area | Books behavior and evidence | Remaining boundary |
|---|---|---|
| Android packaging | Native Java Activity, API 28+, offline packaged assets, APK builds and installs | Physical-device and Play release acceptance not tested |
| Library | Compact resume row, direct Home/Library/Notes/You navigation, visible library search/status filters, grouped searchable settings; import/deduplicate, cover/list modes, recent books, favorites, author/series/rating/tag groups, search, ratings, finished state, progress, Downloads and bulk shelf actions | Distinct Android-oriented design informed by installed skill and Android documentation; Google Drive code exists but OAuth setup and real-account validation are pending |
| Reflow | EPUB, unencrypted MOBI/AZW/AZW3/PRC, FB2; Foliate engine | Browser tests use EPUB/TXT; all Kindle/FB2 variants not tested; DRM unsupported |
| DjVu | Offline decoder, page pixels, searchable existing text, position and notebook marks | Actual image pixels tested; bundled/indirect/large files not exhaustively tested; no source-file annotation editing |
| CHM | Native Java extraction, internal HTML/resources, chapters/links | Real authored ITSF fixture tested on Android; compressed variants need broader corpus tests |
| UMD | Compressed text, chapter navigation, metadata, images from adapted parser | Authored text fixture including reopen tested; comic/mixed variants not exhaustively tested |
| Comics and images | CBZ/CBR, archive image pages, WEBP/JPEG/PNG/GIF | Large and uncommon codecs need corpus/device tests |
| Other documents | DOCX layout engine, ODT tables/inline styles/images, MHTML multipart/CID resources and styles, plus RTF/TXT/HTML/Markdown | Rich Word/ODT tables and images and MHTML assets/styles tested; complex office pagination/fields can still differ |
| ZIP/RAR | Nested book imports, comic-image archive grouping, encrypted-archive password prompts | Nested ZIP tested; encrypted variants and very large files need broader corpus testing |
| Scrolled performance | Indexed visible-range lookup for large EPUB/TXT chapters; 16,000-paragraph exact CFI, mutation/layout, highlight and reopen regressions; bounded live progress reporting, current-viewport save on close, and Android long-task measurements in [release evidence](RELEASE-1.1.2.md) | First indexing and layout changes still require measurement; unusual layouts fall back to traversal; no all-device performance certification |
| Reading position | CFI/page positions, progress slider, TOC, whole-book search, return to the previous explicit navigation position | Reopen and search tests pass; behavior across all engine variants not certified |
| Visual settings | Themes, font/background imports, size/spacing/margins/weight/color, indentation, alignment, hyphenation, landscape columns, live replacements, whitespace trimming and bionic processing | Reference has additional fine controls and exact style differences |
| Reader input | 24 actions mapped to tap/swipe/long press and hardware events; editable reader bar | Nested overflowing book content retains its gesture in native and custom page-turn modes; cancelled drags return to the starting page; real volume key tested; camera/headset/Bluetooth/sensor hardware not physically tested |
| Animation | Native outgoing-page capture, fold, flip, slide, fade, instant/E-ink modes; duration control | Geometric fold differs from reference curl; browser fallback is simpler; no physical E-ink optimization |
| Auto reading | Five auto-scroll modes, speed setting, page/chapter continuation | Long-duration and every format/mode combination not certified |
| Light and focus | Native brightness, edge gesture, warm filter, rulers, break reminders, wake/orientation controls | Sensor/orientation ranges and device-specific behavior need physical testing |
| Annotations | EPUB/TXT highlight, underline, strike, squiggle, notes/bookmarks, export; on-page recolor/style/note/delete controls, remembered style/color, selection-relative tools, tombstones for sync | Compact selection actions, multiline editor and annotation search/tabs/sort are implemented. Local notebook export is retained; Readwise integration is excluded from 1.9.3. |
| PDF | Render/text/search, editable forms, ink/text/highlight annotations, edit/delete/list, export, pinch/double-tap zoom, dual page, themes and explicit original-file save-back | Independent API checks verify exported ink/text/forms and original-file embedded annotation; OCR is absent |
| Speech | Android foreground media service, sentence queue, voice/rate/pitch, pause/resume/skip/stop, following text, sleep timer | Actual utterance callbacks and screen-off chapter continuation to completion pass; physical audible output/Bluetooth and every voice are not tested |
| Dictionary/translation/share | Compatible dictionary intent plus web fallback, translation link, native share | Third-party apps and providers require their own installation/network; compatibility not exhaustively tested |
| Files | Scoped system folders and optional Android all-files access; browse/open/create/rename/copy/move/delete, including cross-provider copy; FTP/explicit FTPS browsing and file operations | Real DocumentsProvider/shared-storage operations and FTP login/list/download/import/upload/mkdir/rename/delete pass; explicit FTPS rejects an untrusted certificate. Valid public-certificate FTPS server acceptance is not tested; transfers are capped at 128 MB |
| Network books | OPDS browse/search/download; personal catalog URLs and Calibre-compatible feeds | Local authenticated OPDS search, acquisition and Downloads tracking pass; live Calibre/provider accounts remain untested |
| Local backup | ZIP with files, marks, sessions, settings, fonts/background; validated merge restore | Merge test passes; max archive 512 MB, entry 256 MB |
| Cloud | WebDAV or Dropbox token; automatic/manual reading-state merge and full-library ZIP upload/restore; encrypted credentials; disconnect | Android + local WebDAV protocol fixture passes, including HTTP 204 and binary transfer; real provider/account tests pending; access-token setup accepted by user; transfer cap 128 MB |
| Privacy lock | PBKDF2 password startup gate, Android biometric prompt | Wrong/correct password gate tested across a true WebView reload; biometric hardware remains untested; book files are not encrypted at rest |
| Shortcuts/widget | Pinned book shortcut; cover shelf widget with recent/favorites/all/tag groups | Pixel launcher pinning, widget configuration and matching-book opens verified manually; other launchers remain untested |
| Statistics | Real active reading time, sessions, goals, book progress, estimated word/speed metrics | These are local estimates; not identical to reference calculations |
| Languages | 12 main-menu language dictionaries, Arabic RTL and English fallback | Extended dialogs/help remain partly English; reference has a broader locale set |
| Pro/account extras | No advertising; independent package/name | No paid-app licensing, original customer-support service, or original account integrations |

Reference inventory: [Google Play](https://play.google.com/store/apps/details?id=com.flyersoft.moonreaderp&hl=en_IN) and [developer website](https://www.moondownload.com/), checked 2026-11-13. Details of the reverse-engineering inspection are in REFERENCE-ANALYSIS.md.

Test artifacts: `../test-results/report/index.html`, `android-test-results.json`, and `screenshots/`. The report is a local development result; it does not establish Google Play approval or full product parity.

## Validation totals for this release

- Browser: 31 automated end-to-end checks.
- Android: 9 core checks plus 5 completion checks, 6 FTP/credential checks, passage-only speech, two native selection flows, and native swipe/D-pad checks.
- Launcher: 2 separately recorded manual flows for widget/shortcut pinning, configuration and matching-book opening.

The Android CDP harness now performs a real page reload through `location.reload()` because this WebView acknowledged the protocol's `Page.reload` command without navigating. Password and persistence results were rerun with the corrected harness. Full-device inspection also verified that system status/navigation bars no longer overlap the WebView.

Version 1.0.1 additionally verifies native long-press/selection-handle changes and highlight saving in paginated and scrolled reading. See SCROLL-AND-SELECTION.md and scroll-performance-after.json.

Version 1.0.2 verifies native swipe ownership and D-pad page turns without screenshot capture. Native long-press/handle/save checks were rerun in both reading flows. Its 207-frame scrolling sample had a 16.7 ms p95 interval, zero intervals above 34 ms, and no observed JS long tasks; its shorter page-turn sample also had 16.7 ms p95. These are isolated 60 Hz emulator samples, not universal smoothness or physical-device guarantees. See RELEASE-1.0.2.md for artifact details.


Version 1.1.0 also verifies modern EPUB3 series metadata, multiline annotation cancel/edit flows, notebook filtering, jump-back navigation, Readwise authentication/export/error payloads against a protocol fixture, embedded PDF restyling without duplicate IDs, and edit/delete compatibility with legacy Books PDF IDs. Notebook and the embedded PDF annotation list share the same saved-mark editor and deletion path.

The final scrolling sample recorded 206 frame intervals, p95 16.7 ms, max 16.8 ms, zero intervals over 34 ms, zero observed long tasks and zero full host-body localization walks. The separate swipe/D-pad sample recorded 61 intervals with p95 16.7 ms and zero screenshot captures. These are short emulator measurements, not physical-device certification. See RELEASE-1.1.0.md.

Manual gesture fixes and their validation: [Books 1.1.3 release evidence](RELEASE-1.1.3.md).

Vertical scrolling is now the default, including a one-time migration of old saved reading modes. The header shows Scroll / Pages and retains subsequent mode choices. See [1.1.4 evidence](RELEASE-1.1.4.md).

The 1.2.0 interface refresh is covered by 65 browser checks, phone/tablet geometry checks, Android touch and upgrade checks, and visual inspection. Details and exact device limitations: [RELEASE-1.2.0.md](RELEASE-1.2.0.md).

## 1.5.0 reading tools extension

- Seven interface palettes and eighteen independent reading-page themes, with visual selectors.
- Nineteen reading font choices: fifteen bundled offline families, publisher typography, and three system choices. Custom font import remains available.
- Chapters/bookmarks/images in a searchable sidebar; illustration previews, saving, and chapter return. PDF gallery shows rendered page previews, not extracted PDF image objects. Chapter batches and image-byte limits bound memory.
- Direct HTTP(S) book-file download into the offline library; existing OPDS catalogs remain available. Save book file exports original imported bytes; PDF's separate annotated export continues to include edits.
- A single translucent marker layer avoids double-dark inline fragments. Eight preset highlight colors, custom color, underline/strike/squiggle, notes and editing remain available.
- Native voice previews, language filter, Android-reported quality/network requirements, speed presets, sentence transport and a pinned Start action. Word feedback depends on the installed TTS engine providing range callbacks; Books does not bundle a neural speech service.
- Short motion respects system and app reduced-motion preferences and keeps the normal reader scroll path native.

Release evidence and provider limitations: [1.5.0](RELEASE-1.5.0.md).
