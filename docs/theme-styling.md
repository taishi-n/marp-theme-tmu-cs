# Theme Styling

This document describes the user-visible styling provided by `theme/tmu-cs.css`.

## Visual Direction

The theme uses a white background, dark body text, and a green accent (`#006543`) as the primary identity color. The color tokens are defined in `:root` and reused across headings, pagination, footnotes, citations, code annotations, and math overlays.

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

The custom engine can populate default `header` and `footer` values from front matter when those fields are omitted.

## Title Slide

Slides with the `title-slide` class have their own layout rules.

- pagination is hidden
- header and footer are hidden
- `h1` through `h4` are resized and spaced for a title-page composition
- the slide starts lower on the canvas than a normal content slide

The engine can auto-generate this slide from front matter fields such as `title`, `subtitle`, `author`, `affiliation`, and `date`.

## Typography And Common Elements

The theme styles the standard Marp/Markdown block elements:

- `h1`, `h2`, `h3` use the accent color and a compact academic slide hierarchy
- paragraphs, lists, blockquotes, and tables share a unified line height
- lists use shallow indentation for dense slide layouts
- `strong` reuses the accent color
- `mark` uses an underline-like highlight instead of a solid block highlight
- inline code gets a muted chip-style background

The base body font is a Japanese sans-serif stack, while code uses a monospace stack centered on PlemolJP Console.

## Columns

Two helper patterns are supported for side-by-side layout:

- `.columns` / `.column` for div-based grid layouts
- `.columns-table` for a table-based two-column layout

Example:

```html
<div class="columns">
  <div class="column">
    <h3>Left</h3>
    <ul><li>Point A</li></ul>
  </div>
  <div class="column">
    <h3>Right</h3>
    <ul><li>Point B</li></ul>
  </div>
</div>
```

The sample deck also uses `.columns-table` when a more stable raw-HTML layout is preferred.

## Citations And Footnotes

Citation references and Markdown footnotes are rendered into a shared footnote-style area near the bottom of the slide.

- citation keys in body text are styled with `.citation-ref`
- bibliography and footnote blocks use marker elements followed by unstyled lists
- labels use tabular numerals and accent coloring
- DOI/URL links inherit accent styling

This styling is paired with the citation pipeline in `src/markdown/process-citations.mjs`.

## Code Blocks And Code Annotation Panels

Code styling is driven by `.marp-code` and related selectors.

- code blocks use a muted background with rounded corners
- each line is rendered as a separate `.line`
- semantic emphasis classes are available:
  - `.is-highlighted`
  - `.is-focused`
  - `.is-warning`
  - `.is-error`
  - `.is-info`
- annotated lines add `.has-annotation`

When code annotations are present, the code block is followed by a `.code-annotations` panel. Each annotation row contains:

- line numbers
- a label pill
- explanatory text

This presentation is paired with the Shiki transformer in `src/shiki/annotate-transformer.mjs`.

## Math Annotation Overlay

Annotated display-math blocks use additional wrapper elements and overlay layers:

- `.marp-math-block.has-annotations`
- `.eqann-stage`
- `.eqann-math`
- `.eqann-overlay`
- `.eqann-box`
- `.eqann-warning`
- `.eqann-debug`

The CSS defines the visual structure, while placement and connector drawing are handled by the runtime emitted from `src/math/annotate-math-block.mjs`.

## Implementation Map

- Theme variables and layout: `theme/tmu-cs.css`
- Header/footer/title-slide defaults: `src/pipeline/deck-defaults.mjs`
- Citation block generation: `src/markdown/process-citations.mjs`
- Code annotation rendering: `src/shiki/annotate-transformer.mjs`
- Math annotation wrapper and runtime injection: `src/math/annotate-math-block.mjs`
