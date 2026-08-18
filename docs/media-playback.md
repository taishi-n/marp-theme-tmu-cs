# Sequential Media Playback

This guide describes how to turn playable media on a slide into ordered presentation steps. The feature is disabled by default and applies to interactive HTML presentations generated with the package's custom engine.

## Quick Start

Enable sequential playback for every slide in front matter:

```yaml
---
marp: true
theme: tmu-cs
mediaPlayback: sequential
---
```

To enable it on only one slide, use a local directive:

```md
<!-- _mediaPlayback: sequential -->

![Animated result](result.gif)

<audio controls src="narration.wav"></audio>
```

When the deck-wide option is enabled, use a local override to disable it on one slide:

```md
<!-- _mediaPlayback: off -->
```

The local directive must be outside fenced code blocks and speaker-note comments. It may appear alongside standard local Marp directives such as `<!-- _class: column-layout -->`.

## Supported Playback Steps

Playable elements are collected in rendered document order.

| Source element | Forward action | Backward reset |
| :------------- | :------------- | :------------- |
| Markdown or HTML image whose URL ends in `.gif` | Replace the poster with the animated GIF | Restore the poster and play button |
| Native `<audio>` | Call the browser media player's `play()` method | Pause and seek to the beginning |
| `<audio class="wavesurfer-spectrogram">` | Start the wavegram audio player | Pause and seek to the beginning |
| Native `<video>` | Call the browser media player's `play()` method | Pause and seek to the beginning |

Static images are not playback steps. The hidden native `audio` inside a spectrogram wrapper is also excluded so that one spectrogram contributes exactly one step.

When a slide uses columns or other HTML layout containers, source order still determines playback order. Visual left-to-right placement does not reorder the steps.

## Navigation Behavior

The feature intercepts only unmodified presentation arrows and Marp's on-screen previous/next controls.

| Input | While a matching media step exists | When no matching media step exists |
| :---- | :--------------------------------- | :--------------------------------- |
| Right or down arrow | Play the next unplayed element | Continue normal Marp forward navigation |
| On-screen next button | Play the next unplayed element | Continue normal Marp forward navigation |
| Left or up arrow | Reset the most recently played element | Continue normal Marp backward navigation |
| On-screen previous button | Reset the most recently played element | Continue normal Marp backward navigation |

Media steps are consumed before Marp fragments or slide changes. Holding an arrow key does not rapidly consume every step; each new key press advances at most one media item.

Shift-modified arrows, Page Up, Page Down, Space, the mouse wheel, swipe gestures, and direct hash navigation keep Marp's normal behavior. Arrows pressed while an `audio`, `video`, `wavegram-player`, button, form field, or editable element has focus are left to that control.

The next-slide and overview preview frames do not consume media steps. Normal presentation view and the current-slide pane of presenter view do.

## Playback State and Manual Controls

Each playable element starts as an unplayed step. Starting a GIF or native media element manually also marks that element as played, so the next forward arrow moves to the following item.

Backward navigation resets one played item at a time. Leaving the slide resets every item on that slide:

- native audio and video are paused and rewound
- spectrogram audio is paused and rewound, including a play request still waiting for wavegram to load
- an animated GIF is replaced by its poster and play button
- the ordered step state is cleared

Returning to the slide therefore starts the sequence from the beginning. Manual media controls remain usable after a reset.

If a browser rejects playback or a source cannot be loaded, that element still counts as a consumed step. This prevents a broken media item from trapping presentation navigation on one slide.

## Spectrogram Audio and Portable HTML

Wavegram has to fetch and decode its source before it can display and play spectrogram audio. If a forward arrow arrives before loading completes, the runtime records the request and starts playback when wavegram becomes ready.

For local spectrogram sources, use a path relative to the Markdown file:

```html
<audio
  class="wavesurfer-spectrogram"
  controls
  src="audio/example.wav"
  data-spectrogram-height="120"
  data-spectrogram-fft-samples="2048"
></audio>
```

Remote sources must permit cross-origin fetching. For a portable single-file presentation, use the standalone wrapper so media is embedded in the generated HTML:

```bash
npx marp-tmu-cs --standalone slides.md -o slides.html
```

## Complete Example

```md
---
marp: true
theme: tmu-cs
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

---

<!-- _mediaPlayback: off -->

# Ordinary media controls

<audio controls src="audio/background.wav"></audio>
```

On the first slide, four forward actions play the GIF, plain audio, spectrogram audio, and video. The following forward action reaches the next Marp fragment or slide. The second slide uses ordinary Marp navigation because of the local `off` override.

## Troubleshooting

### An arrow advances the slide immediately

Confirm that the deck is rendered with `marp-tmu-cs` or the package's custom `engine.mjs`. Theme CSS alone cannot install the playback runtime. Also confirm that the directive is on the intended slide and that Shift is not held.

### An arrow does nothing while a media control is selected

This is intentional. The runtime preserves native keyboard behavior while an interactive media or form control has focus. Move focus back to the slide before using presentation arrows.

### Spectrogram audio is displayed but does not play

Check the source path and browser console. A remote source must allow CORS for wavegram's fetch and decode step. Building with `--standalone` avoids remote fetching during the presentation when all assets can be embedded successfully.

### The order differs from the visual column order

Playback follows HTML document order. Reorder the Markdown or HTML source to change the sequence.

### PDF or PPTX does not respond to arrows

Sequential playback is an HTML presentation runtime. PDF and PPTX output retain only the initial static media state.

## Implementation and Tests

- directive preprocessing: `src/pipeline/media-playback.mjs`
- media transformation and browser runtime: `src/pipeline/animated-images.mjs`
- pipeline integration: `src/pipeline/markdown-pipeline.mjs`
- directive and engine tests: `test/media-playback.test.mjs`
- media runtime generation tests: `test/media-enhancements.test.mjs`
- regression example: `examples/slides.md`

Run the relevant checks with:

```bash
npm run check
npm run build:html
npm run build:html:standalone:ci
```
