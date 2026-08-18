# Sequential Media Playback

Sequential playback turns media on a slide into ordered presentation steps. It is off by default and works only in interactive HTML rendered with the package engine.

## Enable Playback

Enable it for every slide in front matter:

```yaml
---
mediaPlayback: sequential
---
```

Enable it for one slide with a local Marp directive:

```md
<!-- _mediaPlayback: sequential -->

![Animated result](result.gif)

<audio controls src="narration.wav"></audio>
```

The directive can share a standard grouped comment with other local directives:

```md
<!--
_class: column-layout
_mediaPlayback: sequential
-->
```

When front matter enables playback, `<!-- _mediaPlayback: off -->` disables it for one slide. The supported values are `sequential` and `off`.

## Navigation Contract

Playback steps follow rendered document order. Supported steps are:

- GIF images whose URL ends in `.gif`
- native `audio` and `video` elements
- `audio.wavesurfer-spectrogram` elements

Static images are not steps. A spectrogram and its hidden native audio count as one step.

In normal and presenter views:

- Right, Down, or the on-screen next button plays the step at the current position.
- Left, Up, or the on-screen previous button moves back one position and resets that step.
- When no step remains in that direction, Marp handles navigation normally.
- Leaving or entering the slide resets the position and all media on that slide.

Resetting pauses and rewinds audio or video and restores a GIF poster. A failed media load still consumes its step so navigation cannot become stuck.

Manual play controls remain available, but they do not move the arrow-controlled position. This keeps arrow behavior independent of out-of-order manual playback.

Only unmodified arrow keys and Marp's previous/next buttons participate. Other navigation inputs keep their normal Marp behavior. Arrow keys are also left to a focused media control, button, form field, wavegram player, or editable element.

## Example

```md
---
mediaPlayback: sequential
---

# Ordered media

![Animation](result.gif)

<audio controls src="audio/explanation.wav"></audio>

<audio
  class="wavesurfer-spectrogram"
  controls
  src="audio/analysis.wav"
></audio>

<video controls src="video/demo.mp4"></video>
```

Four forward actions select the GIF, plain audio, spectrogram audio, and video. The next forward action reaches the next Marp fragment or slide.

## Spectrogram And Standalone HTML

Wavegram must load a spectrogram source before playing it. A sequence request made during loading is applied when the player becomes ready.

Local spectrogram paths are resolved relative to the Markdown file. Remote sources must permit cross-origin fetching. To embed all supported assets into one HTML file, use:

```bash
npx marp-tmu-cs --standalone slides.md -o slides.html
```

Sequential playback is an HTML runtime feature. PDF and PPTX output do not provide arrow-controlled media steps.
