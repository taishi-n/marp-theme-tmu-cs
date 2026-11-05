# Marp Core v5 migration record

This record tracks the ordered migration approved on 2026-11-05. Core 5.0.2 is
published under `next`; the migration pins that version explicitly. The stable
CLI remains 4.5.1. No package publication is part of this migration.

## Comparison method

The baseline is commit `77eecf8`. Each stage builds `examples/slides.md`,
`examples/controls.md`, and `examples/comparison.md` as standalone HTML with
slide indexes, then runs the packaged static checker. The decks contain 44, 4,
and 3 pages respectively. Each page is captured in Chrome 156.0.8078.80 at
1280 × 720, device scale 1, with animations disabled and audio analysis settled.
Screenshots and element rectangles are compared with the preceding stage.
Pixel differences use a per-channel tolerance of 20; geometry differences use
0.5 CSS pixels. Changed pages also receive visual inspection.

Browser comparison is explicitly authorized for this migration only. It does
not change the default workflow for other slide work.

Local artifacts are under `examples/dist/marp-v5-migration/` (ignored by Git).
Each stage contains HTML, slide indexes, static reports, dependency versions,
page screenshots, and `layout.json`; comparisons add `comparison.json` and
contact sheets. The baseline also contains an overview of all main-deck pages.
The main deck already emits two estimated code-overflow warnings before the
migration; those warnings are recorded separately from browser observations.

## Stages

| Stage | Change | Validation and layout comparison |
| --- | --- | --- |
| U0 | Baseline: CLI 4.4.0, Core 4.3.0, Marpit 3.2.1 | 100 tests pass; 51 pages captured; no browser errors or external requests |
| U1 | CLI 4.5.1, its Core 4.4.0 and Marpit 3.2.3 | 100 tests pass; all three static reports pass; 51/51 screenshots and element positions unchanged |
| U2 | Explicit Core 5.0.2 and unified feature initialization | 102 tests pass; three static reports pass; 51 pages captured with no browser errors or external requests. 28 pages have pixel changes; element changes are limited to two math pages, the native Mermaid element, and two newly highlighted plain fences |
| U3 | Delegate base Shiki rendering to Core | 104 tests pass; three static reports pass; no browser errors or external requests. 26 pages have pixel changes, mainly syntax colors; only two plain fences change their element rectangles |
| U4 | Native Mermaid with Kroki fallback | 105 tests pass; three static reports pass; all 51 screenshots and element positions unchanged from U3; no browser errors or external requests |
| U5 | MathJax 4 annotation notes | Pending |
| U6 | Package and consumer validation; documentation | Pending |

U2–U5 are developed on `refactor/marp-core-v5`. The completed migration is
adopted only after the comparison and package validation gates pass.

### U2 observations

Core's full build activates MathJax 4 and native Mermaid at initialization; U4
will validate and document its fallback policy. Math glyph shapes and SVG
dimensions change on main-deck pages 5 and 12. All four annotation boxes remain
attached to the intended terms, without overlaps or math errors. The native
Mermaid page changes rendering style and size; sizing is reviewed again in U4.
Plain fences on pages 38 and 39 now receive Core's Shiki output and are brought
under the common wrapping/layout adapter in U3. Other code elements retain
their previous rectangles, with small glyph/color differences from Core's
updated base styles. Controls and comparison decks are pixel-identical.

The first comparison exposed double code padding in the new default theme and
font requests inside Mermaid's imported CSS. U2 removes the duplicate padding
and recursively embeds CSS dependencies, including relative font URLs, with a
cycle guard. Repeated capture confirms zero external browser requests.

### U3 observations

Core now owns grammar loading and base highlighting. The local eager
highlighter and 28-language list are removed. TMU transformers use the public
`shikiTransformers` hook, and the fence adapter retains wrapping, blank lines,
aliases, and fit-height behavior. Native `{2,4-5}` metadata is preserved when
external code is expanded, before step generation and visual wrapping.

The existing C++ and Python samples retain their element positions, line
heights, and emphasis bands. Color differences follow Core's CSS-variable
token palette. The two plain-text examples now use the same layout as the
other fences, removing U2's extra inner padding. Math and media do not move;
controls and comparison decks remain pixel-identical. Contract tests also
cover metadata combined with external code and steps, a language beyond the
old preload list, and escaped/wrapped unknown-language output.

### U4 observations

Native Mermaid remains at Core's intrinsic sizing. Its changed node spacing,
colors, and dimensions are visible on main-deck page 35 and remain clear of
the explanatory text. PlantUML and Graphviz are unchanged. Integrated tests
verify native success without a Kroki URL, an unsupported pie chart falling
back with its original source, and the explicit `mermaid-kroki` escape hatch.
Kroki source remains untouched by code wrapping. Recursive font embedding was
completed in U2 because the full build already activates native Mermaid.
