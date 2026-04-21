# AGENTS.md

## Purpose

This repository provides the `marp-theme-tmu-cs` package: a Marp theme plus a custom Marp engine and preprocessing modules for citations, external code inclusion, step expansion, Shiki-based code annotations, and math annotations.

The main deliverable is not a web app. Most changes affect Markdown-to-slide transformation behavior or slide styling.

## First Files To Read

Start here before making changes:

1. `README.md`
2. `package.json`
3. `engine.mjs`
4. `index.mjs`

Then read the specific module you are changing:

- `theme/tmu-cs.css`: theme styling and layout
- `src/markdown/expand-step-slides.mjs`: expands `step` directives into slide variants
- `src/markdown/process-citations.mjs`: Pandoc-based citation and bibliography processing
- `src/markdown/resolve-external-code.mjs`: expands standalone Markdown links into code fences
- `src/shiki/*.mjs`: code annotation parsing and Shiki transformers
- `src/math/annotate-math-block.mjs`: display-math annotation support

## Architecture

`engine.mjs` is the integration point. It wires together:

- front matter parsing and default deck metadata
- automatic title slide generation
- default header/footer injection
- external code expansion
- citation processing
- Shiki highlighting and annotation transforms
- math annotation collection and rendering

`index.mjs` is the public package surface. If you move or rename exports, update `package.json` exports and keep the public API coherent.

## Repo Conventions

- This package uses ESM (`"type": "module"`).
- Prefer small focused modules under `src/`.
- Keep logic dependency-light unless a new dependency is clearly justified.
- Preserve Node 18+ compatibility.
- Treat `vendor/csl/ieee.csl` as vendored data, not handwritten project logic.
- Do not edit `package-lock.json` unless dependency changes are intentional.

## Development Workflow

Install dependencies if needed:

```bash
npm install
```

Primary local validation commands:

```bash
npm run build:html
npm run build:pdf
npm run build:pptx
```

Live preview:

```bash
npm run watch
```

Package contents check before release-related changes:

```bash
npm pack --dry-run
```

Sample input is `examples/slides.md`. Build outputs are written under `examples/dist/`.

## Validation Expectations

There is no dedicated automated test suite in this repository right now. For behavior changes, validate with the relevant build command at minimum.

Use these checks depending on the change:

- CSS/theme change: `npm run build:html`
- engine or Markdown preprocessing change: `npm run build:html`
- citation change: `npm run build:html` and confirm Pandoc-dependent output still renders
- output-format-sensitive change: also run `npm run build:pdf` or `npm run build:pptx`
- package/export change: `npm pack --dry-run`

## Change Guidance

- When editing `engine.mjs`, keep the processing order stable unless you have a concrete reason to change it.
- When editing Markdown preprocessors, preserve fenced code block and slide-separator handling. These modules explicitly avoid corrupting Markdown structure.
- When editing citation logic, remember that `pandoc` is an external runtime dependency for bibliography processing.
- When editing theme CSS, verify pagination, header/footer, title slide, code blocks, citations, and footnotes on the sample deck.
- When changing public exports, update both `index.mjs` and `package.json`.

## Files Often Safe To Ignore

- `examples/dist/`: generated output
- `anim.gif`, `anim_300.gif`: repository assets, not core logic

## Cautions

- The working tree may already contain user changes. Do not revert unrelated edits.
- `examples/slides.md` is both documentation and a regression sample; avoid incidental rewrites.
- This repo contains user-facing formatting behavior. Small parsing changes can have broad rendering impact, so prefer minimal diffs and verify the sample deck afterward.
