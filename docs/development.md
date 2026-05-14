# Development Guide

This document collects the maintainer-facing information for working on `marp-theme-tmu-cs`.

## Repository Shape

The package is an ESM-based Node package (`"type": "module"`) and targets Node 18 or newer.

Main entry points:

- `README.md`: user-facing quick start
- `docs/theme-styling.md`: user-facing theme styling reference
- `docs/feature-guide.md`: user-facing authoring feature reference
- `scripts/marp-tmu-cs.mjs`: packaged wrapper CLI for external project usage
- `engine.mjs`: orchestrator for the rendering pipeline
- `index.mjs`: package-root public exports
- `theme/tmu-cs.css`: theme CSS
- `src/core/*`: shared parsing, text-processing, and Markdown-structure helpers
- `src/pipeline/*`: deck-level processing stages and HTML postprocessing
- `src/features/*`: feature-level integration points
- `src/shiki/*`: step directive parsing and Shiki line-wrapping helpers
- `vendor/csl/ieee.csl`: bundled CSL data

Supported package entry points are intentionally small:

- `marp-theme-tmu-cs`
- `marp-theme-tmu-cs/engine`
- `marp-theme-tmu-cs/theme.css`
- `marp-theme-tmu-cs/csl/ieee.csl`

Treat files under `src/` as internal implementation details rather than stable public import targets.

## Architecture Notes

`engine.mjs` should remain thin. It wires together:

- pipeline setup
- feature installation
- deck-level render orchestration

Most feature logic should live outside `engine.mjs`:

- `src/pipeline/deck-defaults.mjs`: title slide generation and default `header` / `footer` injection
- `src/pipeline/section-pages.mjs`: section page insertion and TOC command expansion
- `src/pipeline/markdown-pipeline.mjs`: Markdown-path discovery and preprocessing order
- `src/pipeline/auxiliary-pagination.mjs`: HTML postprocessing for auxiliary slides and visible pagination
- `src/pipeline/animated-images.mjs`: HTML postprocessing for GIF playback
- `src/features/citations/*`: citation core, Markdown postprocessing, and backend boundary
- `src/features/code/*`: code preprocessing and highlighting boundary
- `src/features/math/*`: math annotation boundary

When changing engine behavior, keep the processing order stable unless there is a concrete reason to alter it. The feature modules are written with the current order in mind.

The intended render order is:

1. citation preprocessing
2. deck defaults
3. section page / TOC preprocessing
4. external code resolution
5. step expansion
6. Marp render
7. HTML postprocessing

Shared helpers that are reused across preprocessors and renderers should prefer `src/core/*` instead of being duplicated in feature-specific files.

Citation handling is split into:

- citation core
- JS citation backend

The intended boundary is:

- `src/features/citations/core.mjs`: citation orchestration and slide-footnote integration
- `src/features/citations/backends/js.mjs`: Citation.js + citeproc backend

`index.mjs` and `package.json` together define the supported package surface. If public paths or exports change, keep them aligned and update the user-facing docs.

The external-project workflow documented in `README.md` is based on `npm link` plus `npx marp-tmu-cs ...`. The wrapper should remain usable without a project-local `marp.config.mjs`: when `--engine` and `--theme-set` are omitted, it is expected to inject the package defaults automatically.

## Local Workflow

Install dependencies:

```bash
npm install
```

Main validation commands:

```bash
npm test
npm run build:html
npm run build:html:standalone
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

The repository includes a lightweight `node:test` suite for preprocessing and public-surface regressions, plus sample-driven build checks.

Use these checks based on the change:

- CSS or layout changes: run `npm run build:html` and inspect the sample deck
- engine or Markdown preprocessor changes: run `npm test` and `npm run build:html`
- standalone HTML bundling changes: run `npm test`, `npm run build:html`, and `npm run build:html:standalone`
- citation changes: run `npm run build:html` and confirm the JS citation backend still produces the expected output
- output-format-sensitive changes: also run `npm run build:pdf` or `npm run build:pptx`
- package/export changes: run `npm pack --dry-run`
- wrapper CLI argument handling changes: run `npm test` and verify `node scripts/marp-tmu-cs.mjs --help`

When visually checking the sample deck, pay particular attention to:

- title slide generation
- default header and footer
- current section name in the header
- pagination
- auxiliary pages such as section pages and TOC pages
- code blocks and step emphasis states
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
- Section-page / TOC preprocessing: `src/pipeline/section-pages.mjs`
- Auxiliary pagination and current-section header labels: `src/pipeline/auxiliary-pagination.mjs`
- Standalone HTML asset bundling: `scripts/marp-tmu-cs.mjs`, `src/pipeline/standalone-assets.mjs`
- External code inclusion: `src/features/code/index.mjs`, `src/features/code/resolve-external-code.mjs`
- Step slide expansion: `src/features/code/index.mjs`, `src/features/code/expand-step-slides.mjs`
- Citation and bibliography processing: `src/features/citations/index.mjs`, `src/features/citations/core.mjs`
- JS citation backend: `src/features/citations/backends/js.mjs`
- Step directive parsing: `src/shiki/parse-step-directive.mjs`
- Math annotation integration: `src/features/math/index.mjs`
- Math annotation parsing and runtime: `src/features/math/annotate-math-block.mjs`
