# marp-theme-tmu-cs

`marp-theme-tmu-cs` is a Marp theme package for the Department of Computer Science, Tokyo Metropolitan University. It bundles:

- the `tmu-cs` theme CSS
- a custom Marp engine
- JS-based bibliography processing
- Shiki-based C++ code highlighting and annotations
- display-math annotations
- external code inclusion from Markdown

Bibliography processing is fully implemented in JavaScript with Citation.js and citeproc.

## Getting Started

Build the bundled sample slides with the theme, custom engine, citations, code highlighting, math annotations, and external code inclusion enabled:

```bash
git clone https://github.com/tmu-cs/marp-theme-tmu-cs.git
cd marp-theme-tmu-cs
npm install
npm run build:html
```

This writes the sample deck to `examples/dist/slides.html`.

Other useful commands during local verification:

```bash
npm test
npm run build:html:standalone
npm run build:pdf
npm run build:pptx
npm run watch
```

The sample source is `examples/slides.md`. It exercises the theme styling and the package-specific authoring features in one deck.

To build a single-file HTML that inlines local images, audio, videos, GIF player sources, and local HTML iframes, use:

```bash
npm run build:html:standalone
```

## Using From Another Project

This repository is not only a theme CSS package. The `tmu-cs` theme also depends on the custom Marp engine in this package for citation processing, code highlighting, math annotations, and external code inclusion. For that reason, using only the CSS file is not enough if you want the full feature set.

The recommended setup is to create a separate slide project and install this repository as a dependency there.

Example:

```bash
git clone https://github.com/tmu-cs/marp-theme-tmu-cs.git ~/src/marp-theme-tmu-cs

mkdir ~/work/my-slides
cd ~/work/my-slides
npm init -y
npm install --save-dev @marp-team/marp-cli
npm install --save-dev ~/src/marp-theme-tmu-cs
```

Create `marp.config.mjs` in the slide project:

```js
export default {
  themeSet: ["./node_modules/marp-theme-tmu-cs/theme/tmu-cs.css"],
  engine: "./node_modules/marp-theme-tmu-cs/engine.mjs",
};
```

Create `slides.md`:

```yaml
---
marp: true
theme: tmu-cs
math: mathjax
title: Demo
author: Your Name
bibliography: references.bib
codeLinkLanguages:
  - cpp
---
# Hello

This is a citation [@postel1981ip].
```

Build from the slide project:

```bash
npx marp slides.md -o slides.html
npx marp --pdf slides.md -o slides.pdf
npx marp --pptx slides.md -o slides.pptx
```

If you are actively developing this theme and want another project to follow local changes immediately, you can also use `npm link`:

```bash
cd ~/src/marp-theme-tmu-cs
npm link

cd ~/work/my-slides
npm link marp-theme-tmu-cs
```

This package can also be consumed from a published package source instead of a local clone. In that case, replace the local path install with:

```bash
npm install --save-dev marp-theme-tmu-cs
```

## Public Entry Points

This package intentionally exposes a small public surface:

- package root: `marp-theme-tmu-cs`
- engine path: `marp-theme-tmu-cs/engine`
- theme CSS path: `marp-theme-tmu-cs/theme.css`
- bundled IEEE CSL: `marp-theme-tmu-cs/csl/ieee.csl`

Internal implementation files under `src/` are not part of the supported public API.

## Basic Usage

```bash
npx marp \
  --theme-set ./node_modules/marp-theme-tmu-cs/theme/tmu-cs.css \
  --engine ./node_modules/marp-theme-tmu-cs/engine.mjs \
  slides.md \
  -o slides.html
```

For standalone HTML output, use the packaged wrapper CLI so you can pass `--standalone`:

```bash
npx marp-tmu-cs \
  --standalone \
  --theme-set ./node_modules/marp-theme-tmu-cs/theme/tmu-cs.css \
  --engine ./node_modules/marp-theme-tmu-cs/engine.mjs \
  slides.md \
  -o slides.html
```

`--standalone` is intended for HTML output only.

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

External code fences also support height fitting:

````md
```cpp path="cpp/sample.cpp" fit-height="true"
```
````

Annotated code:

```cpp
auto p = std::make_unique<int>(42); // [!annotate label="unique_ptr" note="Ownership is transferred to std::unique_ptr."]
```

Step-emphasized code:

```cpp
int a = 0;              // [!step 1 highlight]
int b = 1;              // [!step 2 highlight]
int c = a + b;          // [!step 3 focus]
dangerous_call();       // [!step 4 warning]
handle_error();         // [!step 5 error]
log_status();           // [!step 6 info]
return c;               // [!step 7 highlight:2]
```

Available actions are `highlight`, `focus`, `warning`, `error`, and `info`. The syntax is `[!step <number> <action>[:N]]`, where `:N` extends the emphasis to `N` consecutive lines.

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
- [Development guide](docs/development.md)
