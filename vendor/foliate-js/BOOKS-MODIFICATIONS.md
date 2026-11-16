# Local Books changes

Upstream: johnfactotum/foliate-js, MIT, revision recorded in BOOKS-UPSTREAM-REVISION.

Books 1.0.1 modifies paginator.js to use passive touch listeners in scrolled flow, rebind listeners when switching flows, leave native text-selection handle gestures alone, scroll on the correct axis through the full chapter, avoid redundant attribute renders, initialize both fling velocity axes, and disconnect the layout observer on destruction. The vendored source includes these modifications; it is not an unmodified upstream checkout.

Books 1.0.2 adds an explicit manual-touch mode for custom gesture mappings and non-slide transitions, rebinds passive listeners when that mode changes, guards empty touch state and zero-time velocity samples, and reads the configured slide duration. Default slide gestures are owned by this engine, while the app handles custom gestures, preventing duplicate page turns. Reflow slide actions use the engine directly instead of wrapping them in a second screenshot animation.


Books 1.1.1 adds `visible-range.js` and uses it for scrolled relocation. The first lookup measures sibling bounds; subsequent lookups binary-search monotonic bounds and traverse only intersecting branches. Nonmonotonic layouts retain complete traversal. DOM changes, font/image/viewport expansion and running animations invalidate or bypass the index. The document tree and CFI format stay unchanged; observers disconnect when the chapter view is destroyed.

The scrolled anchor guard now suppresses only a scroll event at the programmatic anchor's actual position. A no-op anchor no longer causes the next user scroll to be ignored, so progress and saved position update on the first gesture.

Books 1.1.2 follows the bounded-scroll reporting and nested-input ownership patterns reviewed in readest/foliate-js at `22a49acaa120877ede21f713679ab8ba4d1ef663` (MIT, same upstream copyright/license retained here). `scroll-input.js` reserves controls and overflowing content for their native gestures and is shared with the Books host gesture handler. Continuous scrolling reports its position at most once per second, leaving active finger drags to settle; `reportLocation()` commits the current viewport before persistence and pause. Unchanged positions are not re-reported. Pending scroll/selection callbacks are cancelled on destruction. A cancelled page drag returns to its starting page and clears the captured touch state; touch listeners remain stable across repeated flow changes and cancellations. These are scoped adaptations, not an upgrade to the substantially different Readest fork.

The visible-range cache now keeps indexed parent elements with `Uint32Array` child positions and `Float64Array` bounds. It no longer retains an object and direct Node reference per sibling. Full precision preserves the existing boundary comparisons and CFI behavior. DOM/layout invalidation and destruction clear the parent map, and nonmonotonic layouts still use complete traversal. This reduces JavaScript object retention; it does not remove the book's native DOM or guarantee that Chromium garbage collection never pauses.

Books 1.1.3 adapts Readest's `SECTION_SWIPE_DISTANCE`, `singleSectionBoundary` and `#singleSectionTouchDirection` / `#turnSingleSection` logic from the same pinned MIT revision. A fresh outward swipe at a chapter boundary loads one adjacent linear section, including backward and short-section navigation. Selection, nested native scrollers, pinch, cancelled touches, zoom, changing section/direction and the first/last book boundaries are guarded. Normal continuous scrolling remains passive and native; chapter turns occur on release. This implementation does not preload multiple chapters or use Readest's animated section-pull renderer.

Paginated manual-touch mode now claims owned pans with a nonpassive engine listener, leaving nested content and selection native. The Books reflow host finishes touch gestures from Touch Events, with a separate mouse/pen Pointer Event path, so native pointer cancellation cannot lose the swipe and one gesture cannot turn two pages. PDF gesture ownership is unchanged.

## Books 1.4.0 — resize callback teardown

Skip view rendering/expansion after destruction or iframe-document detachment. Disconnect the chapter ResizeObserver on destruction and guard the deferred background update. A browser lifecycle regression exposed a queued resize accessing a removed document during close. The existing immediate-close/scroll regression exercises the fix.

## Books 1.5.0 — boundary fling ownership

A backward boundary swipe could leave the new chapter a few pixels short of its end. A remaining native compositor scroll from the previous document was moving the new one after its anchor was restored, so the next outward gesture missed the two-pixel boundary threshold. While replacing a chapter after an outward boundary swipe, temporarily suspend container scrolling, restore it on the next animation frame and reapply that chapter's boundary anchor. Normal within-chapter scrolling remains native and passive. Destruction and changed-section checks protect the deferred restoration. Repeated outward-swipe regression tests cover returning to the end and turning forward again.

1.7.0: Added an opt-in lock-touch-scroll attribute. Only that mode registers a cancellable scroll listener; ordinary scrolling retains passive listeners. A locked one-finger move prevents native vertical pan, leaving Books gesture mappings and page buttons available.
