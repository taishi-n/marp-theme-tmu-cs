# Development Guide

This document collects the maintainer-facing information for working on `marp-theme-tmu-cs`.

## Repository Shape

The package is an ESM-based Node package (`"type": "module"`) and targets Node 18 or newer.

Main entry points:

- `README.md`: user-facing quick start
- `docs/theme-styling.md`: user-facing theme styling reference
- `docs/feature-guide.md`: user-facing authoring feature reference
- `engine.mjs`: orchestrator for the rendering pipeline
- `index.mjs`: public exports and package paths
- `theme/tmu-cs.css`: theme CSS
- `src/core/*`: shared parsing and text-processing helpers
- `src/pipeline/*`: deck-level processing stages and HTML postprocessing
- `src/features/*`: feature-level integration points
- `src/markdown/*`: Markdown preprocessing
- `src/shiki/*`: code annotation parsing and Shiki transformation
- `src/math/*`: math annotation parsing and runtime injection
- `src/pandoc/*`: Pandoc citation helper filter
- `vendor/csl/ieee.csl`: bundled CSL data

## Architecture Notes

`engine.mjs` should remain thin. It wires together:

- pipeline setup
- feature installation
- deck-level render orchestration

Most feature logic should live outside `engine.mjs`:

- `src/pipeline/deck-defaults.mjs`: title slide generation and default `header` / `footer` injection
- `src/pipeline/markdown-pipeline.mjs`: Markdown-path discovery and preprocessing order
- `src/pipeline/animated-images.mjs`: HTML postprocessing for GIF playback
- `src/features/citations/*`: citation feature boundary
- `src/features/code/*`: code feature boundary
- `src/features/math/*`: math feature boundary

When changing engine behavior, keep the processing order stable unless there is a concrete reason to alter it. The feature modules are written with the current order in mind.

The intended render order is:

1. citation preprocessing
2. deck defaults
3. external code resolution
4. step expansion
5. Marp render
6. HTML postprocessing

Shared helpers that are reused across preprocessors and renderers should prefer `src/core/*` instead of being duplicated in feature-specific files.

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
- Title slide and default marginals: `src/pipeline/deck-defaults.mjs`
- Pipeline orchestration: `engine.mjs`, `src/pipeline/markdown-pipeline.mjs`
- External code inclusion: `src/features/code/index.mjs`, `src/markdown/resolve-external-code.mjs`
- Step slide expansion: `src/features/code/index.mjs`, `src/markdown/expand-step-slides.mjs`
- Citation and bibliography processing: `src/features/citations/index.mjs`, `src/markdown/process-citations.mjs`
- Pandoc citation placeholder filter: `src/pandoc/citation-placeholder.lua`
- Code annotation parsing: `src/shiki/parse-annotate-directive.mjs`
- Step directive parsing: `src/shiki/parse-step-directive.mjs`
- Shiki annotation rendering: `src/features/code/index.mjs`, `src/shiki/annotate-transformer.mjs`
- Math annotation integration: `src/features/math/index.mjs`
- Math annotation parsing and runtime: `src/math/annotate-math-block.mjs`
