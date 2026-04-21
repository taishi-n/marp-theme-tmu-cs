# AGENTS.md

## Documentation Index

- Package overview and quick start: `README.md`
- Theme styling and layout behavior: `docs/theme-styling.md`
- Code highlighting, math annotations, citations, and authoring syntax: `docs/feature-guide.md`
- Developer workflow, validation rules, and maintenance notes: `docs/development.md`

## Source Index

- Engine orchestration: `engine.mjs`
- Public exports and package entry points: `index.mjs`
- Theme CSS and slide decoration: `theme/tmu-cs.css`
- Shared parsing utilities: `src/core/*`
- Pipeline stages and deck defaults: `src/pipeline/*`
- Citation feature core and backend boundary: `src/features/citations/*`
  Primary JS backend: `src/features/citations/backends/js.mjs`
  Pandoc fallback backend: `src/features/citations/backends/pandoc.mjs`
- Code highlighting, wrapping, and step/external-code integration: `src/features/code/*`
- Math annotation integration: `src/features/math/*`
- Step expansion and external code inclusion internals: `src/markdown/*`
- Code annotation parsing and Shiki transformer internals: `src/shiki/*`
- Math annotation parsing and overlay runtime internals: `src/math/*`
- Legacy citation façade and compatibility export: `src/markdown/process-citations.mjs`
- Pandoc citation placeholder filter: `src/pandoc/*`
