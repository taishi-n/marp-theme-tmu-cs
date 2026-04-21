# Development Guide

This document collects the maintainer-facing information for working on `marp-theme-tmu-cs`.

## Repository Shape

The package is an ESM-based Node package (`"type": "module"`) and targets Node 18 or newer.

Main entry points:

- `README.md`: user-facing quick start
- `docs/theme-styling.md`: user-facing theme styling reference
- `docs/feature-guide.md`: user-facing authoring feature reference
- `engine.mjs`: integration point for the full rendering pipeline
- `index.mjs`: public exports and package paths
- `theme/tmu-cs.css`: theme CSS
- `src/markdown/*`: Markdown preprocessing
- `src/shiki/*`: code annotation parsing and Shiki transformation
- `src/math/*`: math annotation parsing and runtime injection
- `src/pandoc/*`: Pandoc citation helper filter
- `vendor/csl/ieee.csl`: bundled CSL data

## Architecture Notes

`engine.mjs` is the central integration layer. It combines:

- front matter parsing
- title slide generation
- default `header` / `footer` injection
- external code expansion
- citation processing
- Shiki highlighting and code annotation rendering
- math annotation collection and runtime injection

When changing engine behavior, keep the processing order stable unless there is a concrete reason to alter it. The feature modules are written with the current order in mind.

`index.mjs` is the public package surface. If public paths or exports change, keep `index.mjs` and `package.json` exports aligned.

## Local Workflow

Install dependencies:

```bash
npm install
```

Main validation commands:

```bash
npm run build:html
npm run build:pdf
npm run build:pptx
```

Live preview:

```bash
npm run watch
```

Package contents check:

```bash
npm pack --dry-run
```

The regression sample deck is `examples/slides.md`. Build outputs are written to `examples/dist/`.

## Validation Guidance

There is no dedicated automated test suite in this repository at the moment, so validation is command- and sample-driven.

Use these checks based on the change:

- CSS or layout changes: run `npm run build:html` and inspect the sample deck
- engine or Markdown preprocessor changes: run `npm run build:html`
- citation changes: run `npm run build:html` and confirm Pandoc-based output still renders correctly
- output-format-sensitive changes: also run `npm run build:pdf` or `npm run build:pptx`
- package/export changes: run `npm pack --dry-run`

When visually checking the sample deck, pay particular attention to:

- title slide generation
- default header and footer
- pagination
- code blocks and code annotation panels
- math annotation overlays
- citations and Markdown footnotes

## Maintenance Rules

- Prefer small focused modules under `src/`.
- Keep the dependency surface minimal unless a new dependency is clearly justified.
- Preserve Node 18+ compatibility.
- Treat `vendor/csl/ieee.csl` as vendored data rather than handwritten project logic.
- Do not edit `package-lock.json` unless dependency changes are intentional.

## Working Tree Cautions

- The working tree may already contain unrelated user changes. Do not revert them.
- `examples/slides.md` serves both as documentation input and as the main regression sample, so avoid incidental rewrites.
- This repository is highly sensitive to formatting and parsing details. Small changes in preprocessors can affect many rendering paths, so prefer minimal diffs and verify behavior after changes.

## Feature-To-Source Index

- Theme styling: `theme/tmu-cs.css`
- Title slide and default marginals: `engine.mjs`
- External code inclusion: `src/markdown/resolve-external-code.mjs`
- Step slide expansion: `src/markdown/expand-step-slides.mjs`
- Citation and bibliography processing: `src/markdown/process-citations.mjs`
- Pandoc citation placeholder filter: `src/pandoc/citation-placeholder.lua`
- Code annotation parsing: `src/shiki/parse-annotate-directive.mjs`
- Step directive parsing: `src/shiki/parse-step-directive.mjs`
- Shiki annotation rendering: `src/shiki/annotate-transformer.mjs`
- Math annotation parsing and runtime: `src/math/annotate-math-block.mjs`
