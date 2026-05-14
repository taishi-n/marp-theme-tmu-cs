# Theme Styling

This document describes the user-visible styling provided by `theme/tmu-cs.css`.

## Visual Direction

The theme uses a white background, dark body text, and a green accent (`#006543`) as the primary identity color. The color tokens are defined in `:root` and reused across headings, pagination, footnotes, citations, code emphasis states, and math overlays.

Key groups of variables include:

- background and surface colors
- text and muted text colors
- accent and accent-soft colors
- semantic colors for highlight, focus, warning, error, and info
- slide padding values for top, bottom, and sides

## Slide Layout

Each slide is styled through the `section` element.

- top, side, and bottom padding are fixed to create a stable presentation frame
- pagination appears in the bottom-right corner through `section::after`
- header and footer are positioned absolutely and span the slide width
- header uses the title/subtitle area visually, while footer shares space with pagination
- normal content slides show the current section name at the right edge of the header
  using the same accent-weighted small-text treatment as pagination

The custom engine can populate default `header` and `footer` values from front matter when those fields are omitted.

## Title Slide

Slides with the `title-slide` class have their own layout rules.

- pagination is hidden
- header and footer are hidden
- `h1` through `h4` are resized and spaced for a title-page composition
- the slide starts lower on the canvas than a normal content slide

The engine can auto-generate this slide from front matter fields such as `title`, `subtitle`, `author`, `affiliation`, and `date`.

## Section Pages And Auxiliary Slides

Slides with `section-page`, `toc-page`, or `auxiliary-page` have dedicated behavior.

- `section-page` centers the section heading and uses the same large heading size as the title slide title
- `toc-page` is used for explicit `<!-- toc -->` slides
- `auxiliary-page` hides header, footer, and visible pagination
- in HTML output, auxiliary pages are removed from the visible page-number count by postprocessing

These classes are attached by the custom engine rather than written directly into the final HTML source.

## Typography And Common Elements

The theme styles the standard Marp/Markdown block elements:

- `h1`, `h2`, `h3` use the accent color and a compact academic slide hierarchy
- paragraphs, lists, blockquotes, and tables share a unified line height
- lists use shallow indentation for dense slide layouts
- `strong` reuses the accent color
- `mark` uses an underline-like highlight instead of a solid block highlight
- inline code gets a muted chip-style background
- normal blockquotes use a left accent bar and a muted note background
- blockquotes whose first direct child is `h4` are rendered as definition cards with a colored heading band

The base body font uses a Japanese sans-serif stack centered on Noto Sans JP.

Inline code and code blocks use the logical `TMU CS Code` family defined in `theme/tmu-cs.css`. This family is split by `unicode-range`:

- half-width Latin characters and common symbols use `Noto Sans Mono ExtraCondensed`
- Japanese and other full-width code points use `Noto Sans JP` (with local fallbacks such as `Noto Sans CJK JP`, `Hiragino Sans`, and `Yu Gothic`)

In other words, the packaged theme default for code is not a single bundled file but a mixed local-font setup built around `Noto Sans Mono ExtraCondensed` + `Noto Sans JP`.

Definition-card example:

```md
> #### Vector
> A collection of numbers
```

This is implemented through `blockquote:has(> h4)` in the theme, so the `h4` heading must be the first direct child inside the quote block.

## Columns

Two helper patterns are supported for side-by-side layout:

- `<!-- _class: column-layout -->` with direct child `<div class="column">...</div>` blocks
- `.columns-table` for a table-based two-column layout

Example:

```md
<!-- _class: column-layout -->

# Title

<div class="column">

### Left

- Point A

</div>

<div class="column">

### Right

- Point B

</div>
```

`column-layout` lays out each direct child `.column` block next to its siblings, so two columns and three columns are both supported without an extra wrapper element.

## Citations And Footnotes

Citation references and Markdown footnotes are rendered into a shared footnote-style area near the bottom of the slide.

- citation keys in body text are styled with `.citation-ref`
- slide-local citation footnotes and Markdown footnotes use marker elements followed by unstyled lists
- the references slide uses an ordered list with `.citation-bibliography-list` and `.citation-bibliography-item`
- labels use tabular numerals and accent coloring
- DOI/URL links inherit accent styling

This styling is paired with the citation core/backend pipeline in `src/features/citations/*`.

## Code Blocks

Code styling is driven by `.marp-code` and related selectors.

- code blocks use a muted background with rounded corners
- each line is rendered as a separate `.line`
- semantic emphasis classes are available:
  - `.is-highlighted`
  - `.is-focused`
  - `.is-warning`
  - `.is-error`
  - `.is-info`

## Math Annotation Overlay

Annotated display-math blocks use additional wrapper elements and overlay layers:

- `.marp-math-block.has-annotations`
- `.eqann-stage`
- `.eqann-math`
- `.eqann-overlay`
- `.eqann-box`
- `.eqann-warning`
- `.eqann-debug`

The CSS defines the visual structure, while placement and connector drawing are handled by the runtime emitted from `src/features/math/annotate-math-block.mjs`.

## Media Wrappers

Media elements use the base `img`, `video`, and `audio` rules for centering. Two HTML postprocess wrappers add extra presentation behavior:

- `.tmu-cs-gif-player` renders GIFs with a still poster and play button
- `.tmu-cs-spectrogram-player` wraps `audio.wavesurfer-spectrogram` with a toolbar, time readout, status line, waveform area, and spectrogram area

The spectrogram wrapper hides the native `audio` controls, adds explicit play/stop controls, and styles the generated waveform and spectrogram canvases as full-width cards.

## Implementation Map

- Theme variables and layout: `theme/tmu-cs.css`
- Header/footer/title-slide defaults: `src/pipeline/deck-defaults.mjs`
- Section-page / TOC-page injection: `src/pipeline/section-pages.mjs`
- Auxiliary pagination and current-section header labels: `src/pipeline/auxiliary-pagination.mjs`
- Citation block generation: `src/features/citations/core.mjs`
- Primary citation backend: `src/features/citations/backends/js.mjs`
- Math annotation wrapper and runtime injection: `src/features/math/annotate-math-block.mjs`
- GIF and spectrogram media wrappers: `src/pipeline/animated-images.mjs`
