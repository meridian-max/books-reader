# Books interface — CRED-inspired, 1.4.0

The user rejected the plain white/blue preview and explicitly requested CRED as the visual reference. Books remains an independent personal ebook reader. Actual covers, reading position, annotations and history supply the content. No CRED branding or proprietary assets are bundled.

## Sources and skills

Installed Frontend Design and Impeccable before design work. Applied `/home/divyansh/.codex/skills/frontend-design/SKILL.md`; Impeccable is installed but its separate workflow was not run.

- https://github.com/anthropics/skills/tree/main/skills/frontend-design
- https://github.com/pbakaus/impeccable
- https://newsroom.cred.club/brand/ — official app screenshot, typography, material treatment
- https://cred.club/ — architectural lighting, scale and composition
- https://play.google.com/store/apps/details?id=com.dreamplug.androidapp&hl=en_IN
- https://github.com/google/fonts/tree/main/ofl/manrope — bundled variable font, SIL OFL

## Design plan, reviewed before implementation

Palette: obsidian #0d0e10, graphite #1a1b1e, silver #f1f0ec, secondary #a8aaae, champagne #d5c4a1, edge #34363a. Manrope for interface, bold 30–34 px headings and 12–15 px supporting type. Book text remains the user's choice. Signature dark is the default, with Light and OLED alternatives.

Make the physical book the focal point: a large cover with modeled spine, page edge and directional light in an inset graphite stage. One full-width reading action, clear progress, then a quieter reading goal and horizontal collection. Left-aligned controls and text; centered cover in the stage. Stable labeled navigation.

```
menu   books                         search
Reading now                           EPUB
              [ large,
            physical cover ]
Title
Author                                 24%
[ Continue reading                     > ]
[goal] Today's reading                 >
Your collection                     See all
[cover]      [cover]      [cover]
Home         Library       Notes       You
```

Profile uses a dark reading pass with actual identity and statistics, followed by history/settings and backup actions. Library lets artwork breathe; notes emphasize saved passages. Sheets and reader menus share the type and material system. Google availability stays honest; local backup works without login.

Plan review: a generic dark dashboard would merely recolor the rejected layout. Instead, restructure around an actual dimensional book, sculpted circular controls, metallic edges and one illuminated primary action. Avoid fake membership tiers, decorative stats, stock art, confetti and perpetual animation. Preserve 48 px interaction areas, focus states, reduced-motion support and the tested reader gesture engine. Only transform/opacity interaction feedback animates; no scroll listeners or continuous lighting animation.

## Reading experience extension — 1.5.0

Keep the approved CRED-inspired shell and bring the same care to the reader's secondary tools. Manrope remains the interface face; real bundled Literata replaces the former generic serif fallback. Other book fonts, the publisher's embedded typography and custom font imports remain user choices.

The sidebar gathers three related destinations: Chapters, Bookmarks and Images. Chapter search and saved places use quiet rows; illustrations use a small gallery and a full-width, image-first viewer with explicit save and chapter actions. Memory is bounded by chapter/page batches.

Interface palettes are Signature, Pearl, OLED black, Evergreen, Deep ocean, Velvet and Sandstone. The independent book-page palette has 18 presets. Palette previews show actual surface/text colors. Reading fonts have a searchable, offline preview library.

Highlights use a single translucent layer, merging overlapping inline fragments so emphasized words do not acquire darker blocks. The floating selection palette shares the app colors and preserves large touch targets. Read-aloud has a voice preview, language filter, Android-reported quality/offline information, speed presets, sentence transport and word feedback when the engine provides timings. It does not synthesize a new voice service.

Motion responds to opening, choosing, pressing and navigating: short drawer/sheet transitions, cover and collection entrances, tab feedback, expanding settings, selection tools and image previews. Reading scroll keeps its native input path; no decorative scroll handler or perpetual animation was added. Both the app preference and system reduced-motion setting suppress motion.

Research references: https://developer.android.com/reference/android/speech/tts/Voice , https://developer.android.com/reference/android/speech/tts/UtteranceProgressListener , https://github.com/google/fonts/tree/main/ofl/literata . Offline font provenance is in `public/fonts/SOURCES.json`.

## Highlight refinement — 1.5.1

The current highlight washes out letterforms because a normal alpha layer covers the ink. Use a soft, continuous marker band with small rounded ends, blended into the page: multiply on light paper and screen on dark pages. Merge inline rectangles once per line, including emphasis, and respect vertical writing. Preserve saved locations, colors, notes and styles without migration.

Palette: Honey #e8cb83, Sage #a8c5a0, Sky #9fc9da, Iris #c4b2d7, Rose #e6aeb4, Peach #e6bd96. The tool surface follows the current reading paper and ink, independently of the library theme. Manrope labels, the actual selected passage in Literata. No gradients, glow or decorative animation on book text.

Layout: a compact action bar near the passage; expanding the marker button reveals the quoted passage, four clearly named styles and six large labeled swatches. Custom color remains available. Selected colors have a check as well as an outline. Close and remove are explicit.

    Selected passage                   custom / close
    “Actual words selected from the book…”
    Marker     Underline     Strike     Wavy
    Honey  Sage  Sky  Iris  Rose  Peach
    Color     Copy     Highlight     Note     More

Plan review: avoid another heavy black palette over a light book, tiny unlabeled T icons, or a large decorative card. The saved ink is the focus; the palette is a short-lived reading tool. Keep large touch targets, reduced motion and the native scrolling path. Verify light/dark and narrow screens, inline emphasis, recoloring, notes, persistence and PDF annotations.

Reference checked: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/mix-blend-mode .

## Unified sidebar bookmarks — 1.5.2

Bookmarks is the book's single sidebar list for saved pages and annotated passages. Keep the approved Signature shell: obsidian #0d0e10, graphite #1a1b1e, silver #f1f0ec, muted #a8aaae, champagne #d5c4a1. Use each saved annotation's actual color as a narrow edge, Manrope for type/date labels and Literata for the full passage.

    [Bookmark this position]
    [Search saved text]
    6 saved items
    Highlight                         remove
    Full saved passage…
    Optional note
    Underline                         remove
    Full saved passage…

Keep all annotation styles and page bookmarks together in reading order, without another level of tabs. Search covers both passage and note; tap navigates, remove deletes the real annotation too. Review: no new decorative card stack, extra category filters or clipped quote text. Preserve the existing reading/galleries and use the same typography and touch sizes.

## Free voice providers — 1.5.2

Keep the Signature listening sheet. Put Voice provider above Language and the real Voice name, then a serif editable sample and Preview/Stop. Preserve the pinned Start button. Keep optional installation guides in one collapsed Add free voices disclosure rather than another screen. No autoplay; preview stops on change or close. Explain downloads, compatibility and online text transmission where relevant. Review on 360 px: selects must fit, actions wrap, long provider descriptions scroll, and setup must never hide Start.

## Listening and theme studio — 1.6.0

Refine the approved Signature design. Keep Manrope for controls and Literata for sample passages. The listening sheet starts with the current book and a compact selected-voice panel, followed by language, named voice and a prominent preview. Put provider setup, pitch and custom preview text behind disclosures. Speed and sleep remain directly available; Start stays pinned. Bundled offline Kokoro voices require no separate installation. Use honest language coverage and keep phone providers available.

Add 20 coordinated collections: 10 light papers and 10 dark palettes, giving 27 app themes and 38 reader palettes. Library themes show a miniature reading composition with real text, actual paper/ink colors and a visible selected check. Search and All/Light/Dark filters keep the collection manageable. Add a direct Themes entry on Home. Preserve page/library independence and existing choices on upgrade.

Layout: book title → selected voice/name/language → language and voice choice → Preview → speed → sleep → optional settings → pinned Start. Theme studio: title and selected theme → search → light/dark filter → two-column previews. Page colors use the same filtering above their compact swatches. Motion is limited to short selection/opening transitions; no new reader scroll work. Review at 360 px and with reduced motion, check text contrast for every palette, and verify offline synthesis on the isolated emulator before distributing.

## Optional voice pack — 1.6.1

Keep the approved Read aloud sheet. Put one compact Natural voices download row above the selected voice: 49 voices, seven languages, 132 MB, and one Download button. Show downloaded MB, a progress bar, Cancel and Retry in place. Completed downloads show Ready offline and a Use voices action if another provider is selected. Phone voices remain usable without the pack. No automatic download, account, external installation or confirmation screen. Preserve language/voice, previews, speed, sleep and themes. Preview/Start must remain disabled for a selected voice whose data is absent. Android owns the download so closing a sheet or restarting Books does not discard it; extraction and integrity checks run away from the UI thread.

## Screenshot feature completion — 1.7.0

Retain Books' approved Signature palette (#191b1e surface, #e7d9b4 accent, #f1f0ed text, #9b9da2 secondary) and Manrope interface type. Keep reading typography independent. Group Control Options by touch, gestures, hardware and status bar; searchable summaries and a visual 3×3 grid avoid a single long list. Keep main text controls visible and fold advanced typography/margins into named groups. Backgrounds use a compact 3-column gallery of lightweight original patterns, with clear import/download actions. Page animation previews respond only to a tap and honor reduced motion. Controls must change actual reader behavior; Android-managed anti-aliasing is explained rather than presented as a fake switch.

## Library polish and responsiveness — 1.8.0

Preserve the approved sculpted book, graphite surfaces and champagne accents. Refine the composition around a shorter cover stage, a literary title in bundled Literata, readable 13–15 px secondary text, and one reading action. Remove the label above the title. Original fallback jackets use bold, stable typography and six coordinated paper/ink palettes; publisher covers stay intact. Actual reading minutes and seven days of activity form a quiet weekly strip, without invented scores or rewards. All 27 app palettes inherit the same geometry.

    menu  books                         search
                 physical book
    Book title in Literata
    Author                            24% read
    [ Continue reading                     > ]
    This week                13 / 20 min today
    M    T    W    T    F    S    S
    Your collection                    See all
    [cover]       [cover]       [cover]
    Home          Library       Notes       You

The authored motion is the cover settling onto its shelf on the first Home visit. Subsequent navigation uses a short directional transition; returning to a route or closing a book restores the shelf's scroll position. Press feedback starts on contact and cancels on drag, including touch scrolling. No perpetual animations, delayed navigation, or additional work on the reading scroll path. System and app reduced-motion preferences suppress transitions.

Measured baseline: 500-book library, Chromium at 4× CPU slowdown, 412×850, reduced motion. Rendering every card on navigation and search creates long tasks. Cache immutable icon markup and generated covers, render 24 cards initially, then append batches near the end with an accessible Show more fallback. Search still covers the entire collection; selection applies to all matching books. Keep pagination state on return and avoid rebuilding the visible batch when selecting one checkbox.

Review before implementation: retain recognizable material and book depth; avoid another card-heavy dashboard, tiny status labels or simultaneous entrance animations. Use 48 px targets, themed focus/selection and 12–16 px surface radii. Test large libraries, long titles, narrow and expanded layouts, large Android font scale, dark/light palettes, reduced motion, saved progress, and manual reader scrolling. Keep optional voice models outside the APK.

Sources consulted: https://developer.android.com/topic/performance/rendering and https://developer.android.com/develop/ui/views/animations/transitions/start-activity . Android screenshots are captured with ADB; browser timing is reported as a controlled benchmark, not physical-device performance.

## Books and their margins — 1.9.0

Extend the established Operate surfaces. Richness comes from each real book and the reader's saved words. Retain obsidian #0d0e10, graphite #1a1b1e, silver #f1f0ec, secondary #a8aaae, champagne #d5c4a1 and edge #34363a; all app palettes inherit the same structure. Literata carries titles and passages, Manrope carries controls. Keep left-aligned text, 48 px targets and the 24-book library batches.

The existing book-options sheet becomes a book portrait: sculpted jacket beside the title, author and format; a persistent reading action; actual progress, reading time and saved items; editable rating and favorite; recent passages; less frequent management actions in one disclosure. A visible Details action on Home makes this discoverable without changing one-tap reading.

    Book details                           close
    [ dimensional ]   Book title
    [   jacket    ]   Author
    [             ]   EPUB       favorite
    Progress                             38% read
    24 min reading               6 saved items
    Your rating          star star star star star
    Saved passages                     See all
    A passage in its saved ink style…
    Manage book                              down
    [ Continue reading                          ]

Home gains a single passage deck, From your margins, with the latest saved quotes and explicit previous/next controls. Nothing rotates automatically. The notebook becomes a searchable reading journal with book and annotation filters, full passages, cover attribution and direct passage navigation. No fabricated quotes, achievements, book summaries or reading data. Empty states explain how to save the first passage.

Delight thesis: a book feels personal when its cover, your place and the words you kept appear together. A manual passage change moves a short distance in the chosen direction (160 ms); detail sheets use the existing 180 ms entrance. No staggered rows, loops, reader scroll work, new fonts, models or dependencies. Reduced motion switches instantly.

Plan review: this is an extension of the approved literary/material world, not another dashboard or palette change. Avoid decorative metric tiles and giant quotation glyphs. Bound journal rendering to 24 items with Show more; search all saved items. Verify empty/long/mixed-style content, persistence, keyboard/touch, all themes, Android font scale 1.3, phone/tablet and the unchanged manual reading gesture path.

The user's follow-up asks for a more playful reason to return. Add Pick my next read on Home: a fan of up to three real covers, explicit discovery action, the selected title and author, and a direct reading button. Prefer unread books, then unfinished books, then the whole shelf; explain the actual pool. Avoid immediate repeats and remember the last pick locally. A manual shuffle exchanges the center cover in 260 ms while its title and actions are usable immediately. No automatic shuffling, fake urgency, reward currency, tracking, or remote artwork. With one eligible book there is one reading action; with none, omit the section. This is an on-demand discovery moment inside the existing Home composition, using the same fonts, palette and material depth.
