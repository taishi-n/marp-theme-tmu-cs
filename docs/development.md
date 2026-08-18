# Development Guide

This document collects the maintainer-facing information for working on `marp-theme-tmu-cs`.

## Repository Shape

The package is an ESM-based Node package (`"type": "module"`) and targets Node 20.19.0 or newer.

Main entry points:

- `README.md`: user-facing quick start
- `docs/theme-styling.md`: user-facing theme styling reference
- `docs/feature-guide.md`: user-facing authoring feature reference
- `docs/media-playback.md`: sequential media playback authoring and navigation contract
- `scripts/marp-tmu-cs.mjs`: packaged wrapper CLI for external project usage
- `engine.mjs`: orchestrator for the rendering pipeline
- `index.mjs`: package-root public exports
- `theme/tmu-cs.css`: theme CSS
- `src/core/*`: shared parsing, text-processing, and Markdown-structure helpers
- `src/pipeline/*`: deck-level processing stages and HTML postprocessing
- `src/features/*`: feature-level integration points
- `src/shiki/*`: step directive parsing and Shiki line-wrapping helpers
- `vendor/csl/ieee.csl`: bundled CSL data

Canonical package entry points are intentionally small:

- `marp-theme-tmu-cs`
- `marp-theme-tmu-cs/engine`
- `marp-theme-tmu-cs/theme.css`
- `marp-theme-tmu-cs/csl/ieee.csl`

`engine.mjs`, `theme`, and `theme/tmu-cs.css` remain compatibility aliases.

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
- `src/pipeline/media-playback.mjs`: Marp directive registration for sequential media playback
- `src/pipeline/auxiliary-pagination.mjs`: HTML postprocessing for auxiliary slides and visible pagination
- `src/pipeline/animated-images.mjs`: HTML postprocessing and runtime for GIF, spectrogram, and sequential media playback
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
6. Marp render, including media playback directive application
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
npm run check
npm run build:html
npm run build:html:standalone
npm run build:html:standalone:ci
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

Dependency audit:

```bash
npm audit --omit=dev
```

As of 2026-08-18, the direct `js-yaml` advisories are resolved and safe transitive updates have been applied. Four high-severity findings remain only through `@marp-team/marp-cli -> puppeteer-core -> @puppeteer/browsers -> extract-zip`. The affected extractor is used while acquiring a browser archive, not while parsing a deck or resolving its authored assets. npm offers no compatible upgrade and incorrectly proposes downgrading Marp CLI to 2.4.0, so the project retains Marp CLI 4.4.0 and will update once its Puppeteer chain contains a fixed `extract-zip` release.

The citation backend directly uses `@xmldom/xmldom` 0.9.11. `mathjax-full` 3.2.2 is retained because both the annotation implementation and Marp Core currently use the MathJax 3 module API. Its `speech-rule-engine` dependency still pins `@xmldom/xmldom` 0.9.10 and emits an upstream deprecation warning during a clean install. Do not hide this with a package-level npm override: dependency overrides are root-project policy and are not applied when this package is installed by a consumer. Revisit this constraint when Marp Core migrates away from `mathjax-full` 3.

The regression sample deck is `examples/slides.md`. Build outputs are written to `examples/dist/`.

## Validation Guidance

The repository includes a lightweight `node:test` suite for preprocessing and public-surface regressions, plus sample-driven build checks.

Use these checks based on the change:

- CSS or layout changes: run `npm run build:html` and inspect the sample deck
- engine or Markdown preprocessor changes: run `npm test` and `npm run build:html`
- sequential media playback changes: run `npm run check`, build the sample HTML, and verify forward/back keys plus on-screen controls in a browser
- standalone HTML bundling changes: run `npm test` and the deterministic `npm run build:html:standalone:ci`; use `npm run build:html:standalone` as a network integration check for remote sample assets
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
- Preserve Node 20.19.0+ compatibility and run CI on the latest Node 20 release plus the current LTS release.
- Treat `vendor/csl/ieee.csl` as vendored data rather than handwritten project logic.
- Do not edit `package-lock.json` unless dependency changes are intentional.

## Working Tree Cautions

- The working tree may already contain unrelated user changes. Do not revert them.
- `examples/slides.md` serves both as documentation input and as the main regression sample, so avoid incidental rewrites.
- This repository is highly sensitive to formatting and parsing details. Small changes in preprocessors can affect many rendering paths, so prefer minimal diffs and verify behavior after changes.
