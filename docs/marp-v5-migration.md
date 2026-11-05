# Marp Core v5 migration record

This record tracks the ordered migration approved on 2026-11-05. Core 5.0.2 is
published under `next` ([upstream release](https://github.com/marp-team/marp-core/releases/tag/v5.0.2)); the migration pins that version explicitly. The stable
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
| U5 | MathJax 4 annotation notes | 106 tests pass; three static reports pass; all element positions unchanged. Only 24 pixels change on the annotation page; no browser errors, math errors, or external requests |
| U6 | Package and consumer validation; documentation | 107 tests pass on Node 20.19.0, 24.22.2, and 26.12.0; clean package builds all 57 sample pages; consumer builds/static checks pass on 233 pages. Final 51-page comparison changes only the corrected Mermaid explanation and one pixel in a note |

U2–U6 were developed on `refactor/marp-core-v5`. The migration is adopted on
`main` after the comparison and package validation gates pass.

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

### U5 observations

Notes delegate inline math to the active Core math renderer after rendering
the annotated equation. This shares MathJax 4's document, packages, and font
handling instead of maintaining a second MathJax integration. Parsing remains
independent of rendering. Tests cover note SVG, extended TeX commands, escaped
HTML, and runtime injection once per render across repeated renders.

Main-deck page 12 changes only the small inline math glyph inside a note; its
four boxes and all other measured elements retain their rectangles. The direct
MathJax 3 dependency is removed. CLI 4.5.1 still includes Core 4 / MathJax 3 in
its own dependency chain; removing those transitive packages requires a future
CLI update, not a consumer-ineffective dependency override.

### U6 observations

Consumer and added-sample checks exposed four integration issues, fixed in
`eff1f4d`:

- CLI can select its bundled Core 4 when invoked outside this checkout.
  Initialization now selects this package's explicit Core 5 full build while
  preserving the CLI options and initializing its getter once.
- The note attribute parser interpreted TeX commands beginning with `\t`,
  `\n`, or `\r` as text escapes. Math segments now preserve those commands.
- MathJax 4 can return several SVG segments for one inline expression. Notes
  now retain the complete renderer result, including break nodes, so operators
  and the rest of the expression are preserved.
- Some Kroki SVGs have percentage dimensions and only a `viewBox`, which can
  collapse to zero size in auto-scaling. Standalone embedding supplies intrinsic
  dimensions from the aspect ratio while preserving explicit dimensions,
  including Graphviz's point units.

The added `examples/native-features.md` covers six pages: native line metadata
with visual wrapping, PowerShell, native Mermaid, unsupported Mermaid fallback,
explicit Kroki selection, and math inside notes. All six were captured and
visually inspected with zero browser errors, external requests, or math errors.
Image checks also require nonzero displayed dimensions.

The final existing-deck comparison against U5 has two changed pages. Page 35
updates the explanation to describe native Mermaid and fallback selection;
page 12 changes one pixel and gains an inline MathJax container without moving
the note boxes. All other pixels are identical. The local
`examples/dist/marp-v5-migration/review.html` viewer switches between all stages,
decks, and pages; full-resolution PNGs and the six-page overview are linked.

Package validation installs the tarball in a fresh temporary consumer using
registry dependencies, without local development links. On Node 20.19.0, its
public exports and wrapper build all four decks (44 + 4 + 3 + 6 pages), followed
by successful standalone static checks with no external assets. Node 24.22.2
also passes a clean-package public-export/render smoke. Lint and type checks
pass, and the full 107-test suite passes on all three tested Node versions.

Existing consumer builds and their static checks pass for `keio-sap` (121
pages), `onolab-research-intro` (30), and `oss2-exp-taslp/slides/jvs-paired-motion`
(82). The paired-motion source and audio contracts also pass. Consumer sources
were not edited; the dirty Git inventory in `oss2-exp-taslp` is unchanged.
Consumer browser review was not performed.

The repository's authoring skill and the installed skill reference now describe
native metadata, renderer selection, and shared note math. Their validation
passes; the default browser-review policy is unchanged.

### Remaining maintenance boundaries

Core 5.0.2 remains an upstream release candidate. CLI 4.5.1 still installs Core
4 / MathJax 3 transitively even though the theme renders with Core 5. Publication
and removal of that legacy CLI dependency chain are separate work.

The production dependency audit does not pass: it reports 16 affected packages
(12 high, 2 moderate, 2 low), compared with 19 (14 high, 3 moderate, 2 low) for
the U0 lockfile under the same advisory database. Remaining paths include
the CLI/Puppeteer chain, the legacy speech-rule-engine chain, `js-yaml`, and
`@xmldom/xmldom`. Compatible YAML/XML updates and upstream CLI fixes should be
handled as dependency maintenance; this migration does not claim to resolve
all advisories or apply npm's incompatible downgrade suggestions.

### Implementation commits

| Stage | Signed commit |
| --- | --- |
| U1 | `4962039` |
| U2 | `862c716` |
| U3 | `f5edcef` |
| U4 | `5d919ef` |
| U5 | `4a4372e` |
| U6 integration fixes | `eff1f4d` |
