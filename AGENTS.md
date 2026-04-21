# AGENTS.md

## Documentation Index

- Package overview and quick start: `README.md`
- Theme styling and layout behavior: `docs/theme-styling.md`
- Code highlighting, math annotations, citations, and authoring syntax: `docs/feature-guide.md`
- Developer workflow, validation rules, and maintenance notes: `docs/development.md`

## Source Index

- Engine orchestration: `engine.mjs`
- Public exports and package entry points: `index.mjs`
  Supported package entry points: package root, `engine`, `theme.css`, `csl/ieee.csl`
- Theme CSS and slide decoration: `theme/tmu-cs.css`
- Shared parsing utilities: `src/core/*`
- Pipeline stages and deck defaults: `src/pipeline/*`
- Citation feature core and backend boundary: `src/features/citations/*`
  JS backend: `src/features/citations/backends/js.mjs`
- Code highlighting, wrapping, and step/external-code integration: `src/features/code/*`
- Math annotation integration: `src/features/math/*`
- Code annotation parsing and Shiki transformer internals: `src/shiki/*`
- Math annotation parsing and overlay runtime internals: `src/features/math/annotate-math-block.mjs`

Files under `src/` are internal implementation details, not stable public import paths.
