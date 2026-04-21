# marp-theme-tmu-cs

`marp-theme-tmu-cs` is a Marp theme package for the Department of Computer Science, Tokyo Metropolitan University. It bundles:

- the `tmu-cs` theme CSS
- a custom Marp engine
- JS-based bibliography processing
- Shiki-based C++ code highlighting and annotations
- display-math annotations
- external code inclusion from Markdown

## Installation

```bash
npm install marp-theme-tmu-cs
```

Bibliography processing is fully implemented in JavaScript with Citation.js and citeproc.

## Basic Usage

```bash
npx marp \
  --theme-set ./node_modules/marp-theme-tmu-cs/theme/tmu-cs.css \
  --engine ./node_modules/marp-theme-tmu-cs/engine.mjs \
  slides.md \
  -o slides.html
```

Minimal front matter:

```yaml
---
marp: true
theme: tmu-cs
math: mathjax
title: TMU-CS Demo
author: Your Name
bibliography: references.bib
codeLinkLanguages:
  - cpp
---
```

## Theme-Specific Syntax

External code inclusion:

```md
[sample.cpp](cpp/sample.cpp)
```

Code annotation:

```cpp
auto p = std::make_unique<int>(42);
// [!annotate label="unique_ptr" note="Ownership is transferred to std::unique_ptr."]
```

Step-based code emphasis:

```cpp
std::cout << *p << '\n'; // [!step 2 info]
```

Math annotation:

```tex
$$
X_k % [!annotate note="The k-th frequency component"]
= \sum_{n=0}^{N-1} x_n
$$
```

Citations:

```md
This is a citation [@postel1981ip].
```

Animated GIF images are shown as a still poster by default and start playing only after the viewer presses the play button.

Long code lines are wrapped automatically, and wrapped segments end with `\` so the continuation is visible.

## Further Documentation

- [Theme styling](docs/theme-styling.md)
- [Feature guide](docs/feature-guide.md)

## Local Development

```bash
npm install
npm run build:html
npm run build:pdf
npm run build:pptx
npm run watch
```
