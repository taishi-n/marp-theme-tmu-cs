# marp-theme-tmu-cs

Node.js 20.19.0 or newer is required.

`marp-theme-tmu-cs` is a Marp theme package for the Department of Computer Science, Tokyo Metropolitan University. It bundles:

- the `tmu-cs` theme CSS
- a custom Marp engine
- automatic section pages and TOC slide expansion
- JS-based bibliography processing
- Shiki-based code highlighting plus step-based emphasis for supported line-comment languages
- Kroki-backed diagram rendering from fenced code blocks
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
npm run check
npm run build:html:standalone
npm run build:pdf
npm run build:pptx
npm run watch
```

The sample source is `examples/slides.md`. It exercises the theme styling and the package-specific authoring features in one deck.

To build a strict single-file HTML that embeds local and remote media, stylesheets, fonts, scripts, GIF player sources, and supported local HTML iframes, use:

```bash
npm run build:html:standalone
```

## Using From Another Project

This repository is not only a theme CSS package. The `tmu-cs` theme also depends on the custom Marp engine in this package for citation processing, code highlighting, math annotations, step expansion, and external code inclusion. For that reason, using only the CSS file is not enough if you want the full feature set.

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

A non-empty `title` generates a title slide unless `titleSlide: false` is set or the first slide is already a title slide.

Build from the slide project with the wrapper CLI:

```bash
npx marp-tmu-cs slides.md -o slides.html
npx marp-tmu-cs --allow-local-files --pdf slides.md -o slides.pdf
npx marp-tmu-cs --allow-local-files --pptx slides.md -o slides.pptx
npx marp-tmu-cs --standalone slides.md -o slides.html
```

`marp-tmu-cs` automatically supplies the bundled engine and theme CSS when they are not explicitly provided, so a project-local `marp.config.mjs` is optional.

`--standalone` is for HTML and fails instead of producing a partially embedded file. It may fetch authored remote URLs and embed scripts from local HTML iframes. Render only trusted decks.

Use `--allow-local-files` only for trusted decks. Without it, external code, spectrogram audio, and standalone local assets are confined to the Markdown input directory after symbolic links are resolved. Bibliography and CSL paths are resolved separately and do not currently use that confinement check.

If you prefer to use plain `marp`, create `marp.config.mjs` in the slide project:

```js
import { enginePath, themePath } from "marp-theme-tmu-cs";

export default {
  engine: enginePath,
  themeSet: [themePath],
};
```

Then build from the slide project:

```bash
npx marp slides.md -o slides.html
npx marp --allow-local-files --pdf slides.md -o slides.pdf
npx marp --allow-local-files --pptx slides.md -o slides.pptx
```

This package can also be consumed from a published package source instead of a local clone. In that case, install it directly and either keep using `marp-tmu-cs` or point plain `marp` at the package paths:

```bash
npm install --save-dev marp-theme-tmu-cs
```

## Public Entry Points

The canonical package entry points are:

- package root: `marp-theme-tmu-cs`
- engine path: `marp-theme-tmu-cs/engine`
- theme CSS path: `marp-theme-tmu-cs/theme.css`
- bundled IEEE CSL: `marp-theme-tmu-cs/csl/ieee.csl`

The package also retains `engine.mjs`, `theme`, and `theme/tmu-cs.css` as compatibility aliases. The root exports `themeName`, `enginePath`, `themePath`, `defaultCslPath`, and `marpEngine`.

Internal implementation files under `src/` are not part of the supported public API.

## Theme-Specific Syntax

Deck-level directives and inline commands:

```yaml
---
sectionPages: true
sectionPageLevel: 2
tocPageMaxLevel: 2
mediaPlayback: sequential
---
```

- `sectionPages`: insert auxiliary section pages automatically
- `sectionPageLevel`: choose which heading level starts a section
- `tocPageMaxLevel`: choose how deep `<!-- toc -->` expands by default
- `mediaPlayback: sequential`: use Left/Right and Marp's previous/next buttons for ordered media steps; Up/Down bypass media and retain normal Marp navigation
- `<!-- toc -->`: expand a TOC slide at the default depth
- `<!-- toc level=3 -->`: override the TOC depth for one page
- `<!-- _mediaPlayback: sequential -->`: enable ordered playback on one slide
- `<!-- _mediaPlayback: off -->`: disable ordered playback on one slide

A TOC before the first section covers the deck. A TOC within a section covers that section; with level-2 sections, use `<!-- toc level=3 -->` to include their child headings.

Section pages and TOC pages are treated as auxiliary slides:

- header, footer, and pagination are hidden
- they are excluded from the visible page-number count
- normal slides place the current section at top-left and pagination at top-right
- the configured `header` appears at bottom-left and `footer` at bottom-right

External code inclusion:

```md
[sample.cpp](cpp/sample.cpp)
```

External code fences also support height fitting, and the engine infers the language from the referenced file extension:

````md
``` path="cpp/sample.cpp" fit-height="true"
```
````

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

Step states are non-cumulative. Equal step numbers are grouped, and missing numbers are allowed.

Visible comments may be kept before the directive, for example `int a = 0; // loop counter [!step 1 highlight]`.

Magic-comment step expansion is available for fenced languages that use line comments supported by the theme. Current prefixes are:

- `//`: `c`, `cpp`, `csharp`, `fsharp`, `go`, `java`, `javascript`, `jsx`, `kotlin`, `php`, `rust`, `scala`, `swift`, `typescript`, `tsx`
- `#`: `perl`, `python`, `r`, `ruby`, `shell`, `toml`, `yaml`
- `--`: `lua`, `sql`

Other Shiki-supported languages still receive syntax highlighting, but the package-specific `step` directive is ignored unless the language is in the list above.

Math annotation:

```tex
$$
X_k % [!math-annotate note="The k-th frequency component"]
= \sum_{n=0}^{N-1} x_n
$$
```

Citations:

```md
This is a citation [@postel1981ip].
```

Animated GIF images are shown as a still poster by default and start playing only after the viewer presses the play button.

Set `mediaPlayback: sequential` in front matter, or use `<!-- _mediaPlayback: sequential -->` on one slide, to step through GIF, native audio/video, and spectrogram audio in document order. Right or the next button pauses any media already playing on the slide before selecting the next step. Left or the previous button resets the preceding step. Up and Down pass directly to Marp without consuming a media step or changing the sequence position. Leaving the slide resets the sequence and all media on it. Manual media controls do not move the sequence position.

See the [sequential media playback guide](docs/media-playback.md) for the complete authoring and navigation contract.

Audio elements with `class="wavesurfer-spectrogram"` hide the native browser controller and instead render a wavegram-based waveform/spectrogram panel in HTML output. Playback, seeking, cursor display, and waveform/spectrogram rendering follow wavegram defaults; the theme only adds the surrounding green frame. Use `data-spectrogram-height` and `data-spectrogram-fft-samples` to pass explicit spectrogram height and FFT size to wavegram. The runtime embeds the wavegram Web Component only when such an audio element exists. Local spectrogram audio sources are embedded as `data:` URLs during HTML rendering so they still work from `file://`, while remote audio sources must allow CORS for analysis.

The spectrogram feature relies on `wavegram` (MIT). Third-party
license notices are collected in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

Long code lines are wrapped automatically, and wrapped segments end with `\` so the continuation is visible.

## Further Documentation

- [Theme styling](docs/theme-styling.md)
- [Feature guide](docs/feature-guide.md)
- [Sequential media playback](docs/media-playback.md)
- [Development guide](docs/development.md)
