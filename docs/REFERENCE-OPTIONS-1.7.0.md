# Reference screenshot coverage — Books 1.7.0

The seven user-supplied screenshots are feature requirements. Books retains its own established interface and implementation; this is not a claim of identical Moon+ Reader pixels, internals, undocumented gear dialogs or all Pro features.

Open a book, then **More → Gestures & buttons** for Control Options or **Style** for Text & layout. Both sheets have a setting search. Choices save automatically. Fonts and layout options apply to reflowable books; fixed-layout pages retain their original typography.

| Visible reference feature | Books implementation | Evidence and boundary |
|---|---|---|
| Screen orientation | Auto/all directions, portrait sensor, landscape sensor, fixed portrait/landscape, reverse portrait/landscape, lock current | All eight requested Android orientation values verified on the emulator. Actual sensor and large-screen OS policy can affect rotation. |
| Shake phone and settings | Assign any reader action; adjustable shake threshold | Simulated Android accelerometer triggered the chosen action. Physical shake sensitivity not calibrated on a phone. |
| Screen top/bottom taps, layout strip, custom 9-square grid | Five preset layouts plus independent nine-zone mapping, with a visual editor and action labels | Actual corner taps opened book information and changed chapters, skipping non-linear EPUB sections. |
| Long tap | Text selection, None, or a chosen action; adjustable long-tap delay | Default text selection and existing highlight persistence regressions pass. Custom actions fire on release after the delay; selection handles remain engine-managed. |
| Volume up/down, Back, Menu, Search, Camera, D-pad | Individual action selectors and a volume-key enable switch | All eleven listed Android key events dispatched their configured actions. D-pad defaults include previous/next chapter and the options menu. |
| Custom hardware keycode mapping | Detect a physical key or enter its Android keycode; assign/remove mappings | F1 (131) was detected and changed font size through a real emulator key event. Home/Power/Recents remain system-owned; Back has a separate selector. |
| Four finger gestures | Independent horizontal and vertical actions; double tap also available | All four directions executed once with actual emulator swipes. Fresh defaults leave vertical swipes unassigned. |
| Allow horizontal flings / disable vertical scrolling | Separate toggles | Browser tests verify opt-out, touch lock, re-enabling native scroll, and working page buttons. Configured vertical actions can still run while touch scrolling is locked. |
| Mini status bar | Show/hide, custom status text, three tap and three long-tap actions | Actual tap opened book information; long-tap opened brightness. Clock, title, chapter and percentage placeholders supported. |
| Font name and weight | Existing bundled font browser, publisher fonts and custom-font import; weight and bold/italic/underline/shadow | Computed EPUB styles and reopen/persistence checked. Available weight faces depend on the selected font. |
| Smooth / anti-alias | Android WebView manages text rasterization automatically | **No equivalent off/on switch.** The settings explain this instead of presenting an ineffective toggle. |
| Justified alignment and hyphenation | Both configurable; alignment reset | Actual EPUB justification verified. Hyphenation follows WebView language/dictionary support. |
| Paragraph, line and font spacing | Paragraph gap, line height, letter spacing and word spacing; sliders and −/+ controls | Real layout settings, saved-theme restoration and spacing reset checked. |
| Font scale | Overall text scale, 50–150%, in addition to text size | A 20 px base at 120% produced 24 px rendered paragraphs. This does not emulate an undocumented glyph-width algorithm. |
| Four margins | Independent left/right/top/bottom margins; common slider and group reset | Actual viewport padding verified; saved themes restore all four. In focus mode the mini-status bar reserves a minimum 44 px bottom area. |
| Save/load theme | Save named reader presets; apply/export/import; existing 38 paper palettes | Presets now include four margins, scale, background and page animation. Older single-margin themes remain compatible. |
| Background gallery | Fifteen original lightweight offline backgrounds | Parchment, linen, cloth, botanical, checkered, gradient and dark options. These are original patterns, not copied reference artwork. |
| Background Download / Album / Folder | Download a direct image URL; Android image picker; selected-folder file list; save current image | Browser network/import/persistence/export checks plus real Android folder grant, PNG selection and JPEG export. No Moon+ proprietary background catalog. Images are resized to at most 1600 px for storage; 8 MB / 40 MP import limits. |
| Page flip animation and thumbnails | Eight selectable previews: none, slide, vertical slide, fade, page fold, 3D flip, zoom, instant/e-ink | Browser page-turn checks pass; native slide/fade/none verified. Page fold is Books’ fold implementation, not Moon+ Reader’s curl renderer. E-ink uses an instant transition; it does not control device refresh drivers. System/app reduced motion is respected. |
| Search, reset, Control Options / Miscellaneous links | Searchable groups, font/alignment/spacing/margin resets, control reset and linked sheets | Reset and search exercised; hardware mappings ignored while a modal is open. |

## Verification files

- `verification-1.7.0/browser.txt`: 46 browser tests, including 7 new end-to-end option tests.
- `verification-1.7.0/android-controls.json`: 8 Android check groups.
- `android-manual-scroll-1.7.0.json`: 6 native scrolling/page-turn check groups.
- `verification-1.7.0/android-background-folder.json`: native folder, Album and export checks.
- `verification-1.7.0/artifact.json`: three APK variants, exact web assets, signing and native alignment checks.

No physical phone was installed or tested. Google OAuth setup and the broader format/provider boundaries in the existing coverage documents remain unchanged. Optional voices stay outside the APK.
