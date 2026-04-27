# marp-theme-tmu-cs

`marp-theme-tmu-cs` is a Marp theme package for the Department of Computer Science, Tokyo Metropolitan University. It bundles:

- the `tmu-cs` theme CSS
- a custom Marp engine
- automatic section pages and TOC slide expansion
- JS-based bibliography processing
- Shiki-based code highlighting plus magic-comment annotations for supported line-comment languages
- display-math annotations
- external code inclusion from Markdown

Bibliography processing is fully implemented in JavaScript with Citation.js and citeproc.

Demo slide deck:

- <https://taishi.org/marp-theme-tmu-cs/sample-slide.html>

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

The recommended setup is to keep one local clone of this repository, register it with `npm link`, and use the packaged `marp-tmu-cs` wrapper from each slide project. That avoids copying this package into every project and also avoids writing a per-project `marp.config.mjs` when you use the wrapper CLI.

Recommended local setup:

```bash
git clone https://github.com/tmu-cs/marp-theme-tmu-cs.git ~/src/marp-theme-tmu-cs
cd ~/src/marp-theme-tmu-cs
npm install
npm link

mkdir ~/work/my-slides
cd ~/work/my-slides
npm init -y
npm install --save-dev @marp-team/marp-cli
npm link marp-theme-tmu-cs
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
---
# Hello

This is a citation [@postel1981ip].
```

Build from the slide project with the wrapper CLI:

```bash
npx marp-tmu-cs slides.md -o slides.html
npx marp-tmu-cs --pdf slides.md -o slides.pdf
npx marp-tmu-cs --pptx slides.md -o slides.pptx
npx marp-tmu-cs --standalone slides.md -o slides.html
```

`marp-tmu-cs` automatically supplies the bundled engine and theme CSS when they are not explicitly provided, so a project-local `marp.config.mjs` is optional.

If you prefer to use plain `marp`, create `marp.config.mjs` in the slide project:

```js
export default {
  themeSet: ["./node_modules/marp-theme-tmu-cs/theme/tmu-cs.css"],
  engine: "./node_modules/marp-theme-tmu-cs/engine.mjs",
};
```

Then build from the slide project:

```bash
npx marp slides.md -o slides.html
npx marp --pdf slides.md -o slides.pdf
npx marp --pptx slides.md -o slides.pptx
```

This package can also be consumed from a published package source instead of a local clone. In that case, install it directly and either keep using `marp-tmu-cs` or point plain `marp` at the package paths:

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

Recommended wrapper usage:

```bash
npx marp-tmu-cs slides.md -o slides.html
npx marp-tmu-cs --pdf slides.md -o slides.pdf
npx marp-tmu-cs --pptx slides.md -o slides.pptx
```

Equivalent plain `marp` usage:

```bash
npx marp \
  --theme-set ./node_modules/marp-theme-tmu-cs/theme/tmu-cs.css \
  --engine ./node_modules/marp-theme-tmu-cs/engine.mjs \
  slides.md \
  -o slides.html
```

For standalone HTML output, use the packaged wrapper CLI with `--standalone`:

```bash
npx marp-tmu-cs \
  --standalone \
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
---
```

Optional deck-structure directives:

```yaml
---
sectionPages: true
sectionPageLevel: 2
tocPageMaxLevel: 2
---
```

## Theme-Specific Syntax

Deck-level directives and inline commands:

```yaml
---
sectionPages: true
sectionPageLevel: 2
tocPageMaxLevel: 2
---
```

- `sectionPages`: insert auxiliary section pages automatically
- `sectionPageLevel`: choose which heading level starts a section
- `tocPageMaxLevel`: choose how deep `<!-- toc -->` expands by default
- `<!-- toc -->`: expand a TOC slide at the default depth
- `<!-- toc level=3 -->`: override the TOC depth for one page

In HTML output, section pages and TOC pages are treated as auxiliary slides:

- header, footer, and pagination are hidden
- they are excluded from the visible page-number count
- normal slides show the current section name at the right side of the header
  using the same visual style as the page number
  in the footer

External code inclusion:

```md
[sample.cpp](cpp/sample.cpp)
```

External code fences also support height fitting, and the engine infers the language from the referenced file extension:

````md
``` path="cpp/sample.cpp" fit-height="true"
```
````

Annotated code:

```cpp
auto p = std::make_unique<int>(42); // [!annotate label="unique_ptr" note="Ownership is transferred to std::unique_ptr."]
```

```python
value = 1
# [!annotate label="value" note="Initial value."]
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

```python
value = 1               # [!step 1 highlight]
total = value + 2       # [!step 2 focus]
print(total)            # [!step 3 info]
```

Available actions are `highlight`, `focus`, `warning`, `error`, and `info`. The syntax is `[!step <number> <action>[:N]]`, where `:N` extends the emphasis to `N` consecutive lines.

Magic-comment annotations and step expansion are available for fenced languages that use line comments supported by the theme. Current prefixes are:

- `//`: `c`, `cpp`, `csharp`, `fsharp`, `go`, `java`, `javascript`, `jsx`, `kotlin`, `php`, `rust`, `scala`, `swift`, `typescript`, `tsx`
- `#`: `perl`, `python`, `r`, `ruby`, `shell`, `toml`, `yaml`
- `--`: `lua`, `sql`

Other Shiki-supported languages still receive syntax highlighting, but the package-specific `annotate` and `step` directives are ignored unless the language is in the list above.

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

Audio elements with `class="wavesurfer-spectrogram"` hide the native browser controller and instead render a wavesurfer.js-based waveform/spectrogram panel with theme play/stop buttons and a current-time display in HTML output. Use `data-spectrogram-height` and `data-spectrogram-fft-samples` to override the default height (`100`) and FFT size (`1024`). The runtime loads wavesurfer.js from CDN only when such an audio element exists. Local spectrogram audio sources are embedded as `data:` URLs during HTML rendering so they still work from `file://`, while remote audio sources must allow CORS for analysis.

The spectrogram feature relies on `wavesurfer.js` (BSD-3-Clause). Third-party
license notices are collected in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

Long code lines are wrapped automatically, and wrapped segments end with `\` so the continuation is visible.

## Further Documentation

- [Theme styling](docs/theme-styling.md)
- [Feature guide](docs/feature-guide.md)
- [Development guide](docs/development.md)
