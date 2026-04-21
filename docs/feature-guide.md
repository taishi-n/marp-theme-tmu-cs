# Feature Guide

This document describes the main authoring features provided by `marp-theme-tmu-cs`.

## Engine Defaults

The custom engine extends normal Marp rendering with document-level defaults.

- it can generate a title slide from front matter
- it can add default `header` and `footer` values when they are omitted
- it resolves external code before rendering
- it processes citations before slide rendering
- it expands step-based code slides before final rendering

Typical front matter:

```yaml
---
marp: true
theme: tmu-cs
paginate: true
math: mathjax
title: TMU-CS
subtitle: Marp slides with annotations
author: Your Name
affiliation: Tokyo Metropolitan University
date: 2026-04-20
bibliography: references.bib
codeLinkLanguages:
  - cpp
---
```

If `header` is not set, the engine builds one from `title / subtitle`. If `footer` is not set, the engine builds one from `author / date`.

Implementation map: `engine.mjs`, `src/pipeline/deck-defaults.mjs`

## Code Highlighting And Code Annotations

The theme uses Shiki for fenced code block highlighting. The annotation flow is designed primarily for `cpp` and `c++` fenced blocks.

### `annotate`

Use `// [!annotate ...]` comments to attach explanatory notes to the previous line of actual code.

```cpp
auto p = std::make_unique<int>(42);
// [!annotate label="unique_ptr" note="Ownership is managed by std::unique_ptr."]
```

Rules:

- `label` is required
- `note` is required
- `:N` may be used to target a range of lines
- comment-only annotation lines attach to the nearest preceding actual code line
- long rendered lines are wrapped automatically, and each continued visual segment ends with `\`

Range example:

```cpp
int a = 1;
int b = 2;
// [!annotate:2 label="Inputs" note="These lines initialize the operands."]
```

### `step`

Use `// [!step ...]` comments to create slide-by-slide emphasis variants.

```cpp
for (int i = 0; i < 10; i++) {  // [!step 1 warning]
  std::cout << i << '\n';       // [!step 2 info]
}
return 0;                       // [!step 3 focus]
```

Syntax:

```text
[!step <number> <highlight|focus|warning|error|info>[:N]]
```

Rules:

- step numbers must be positive integers
- supported actions are `highlight`, `focus`, `warning`, `error`, and `info`
- `:N` expands the effect to multiple code lines
- the engine duplicates slides so each step becomes its own revealed state

Implementation map: `src/features/code/index.mjs`, `src/shiki/parse-annotate-directive.mjs`, `src/shiki/parse-step-directive.mjs`, `src/shiki/annotate-transformer.mjs`, `src/markdown/expand-step-slides.mjs`

## External Code Inclusion

Standalone Markdown links can be expanded into fenced code blocks when the language is allowed by front matter.

```md
[sample.cpp](cpp/sample.cpp)
```

Enable the language in front matter:

```yaml
codeLinkLanguages:
  - cpp
```

Notes:

- the link must occupy the whole line
- only enabled languages are expanded
- language can be inferred from the file extension
- the engine also supports fenced blocks with `path=` or `src=` attributes

Implementation map: `src/features/code/index.mjs`, `src/markdown/resolve-external-code.mjs`

## Animated Images

GIF images are wrapped by the custom engine so they do not autoplay by default in HTML output.

- the slide initially shows a still poster frame
- playback starts only after the viewer presses the play button
- once started, the GIF is swapped in as a normal image element

This applies to standard Markdown image syntax when the image source ends with `.gif`.

Implementation map: `engine.mjs`, `src/pipeline/animated-images.mjs`, `theme/tmu-cs.css`

## Math Highlighting And Math Annotations

Display math can be annotated line by line using `% [!annotate ...]` comments at the end of TeX lines.

```tex
$$
X_k % [!annotate note="The k-th frequency component"]
= \sum_{n=0}^{N-1} % [!annotate note="Summation over all samples"]
x_n % [!annotate label="signal" note="Discrete-time signal"]
$$
```

Requirements and behavior:

- `math: mathjax` must be enabled in front matter
- `note` is required
- `label` is optional
- `color` is optional and accepts hex-style values
- `:N` is parsed but ignored for math annotations
- the annotation must be placed at the end of the line it describes
- the engine wraps the math block and injects a runtime that places note boxes and connectors

Implementation map: `src/features/math/index.mjs`, `src/math/annotate-math-block.mjs`, `engine.mjs`

## Bibliography And Citation Management

The bibliography pipeline is built around the theme's citation syntax plus a BibTeX bibliography file. It is processed entirely in JavaScript using Citation.js and citeproc.

Citation example:

```md
This is a citation [@postel1981ip; @stroustrup2022tour].
```

Front matter:

```yaml
---
bibliography: references.bib
# csl: path/to/style.csl
---
```

Behavior:

- `bibliography:` is required when citation syntax is used
- `csl:` is optional; otherwise the bundled IEEE CSL is used
- cited items are rendered into a footnote-style area on each slide
- Markdown footnotes are merged into the same visual region
- a `## References` slide is populated automatically when requested
- if no references slide is present, the engine appends one when needed
- DOI and URL metadata are turned into links in bibliography entries

Dependency note:

- no external citation tool is required

Implementation map: `src/features/citations/index.mjs`, `src/features/citations/core.mjs`, `src/features/citations/backends/js.mjs`, `src/markdown/process-citations.mjs`, `vendor/csl/ieee.csl`
