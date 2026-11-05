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

In normal and presenter views, navigation follows this mapping:

| Input | Sequential playback behavior |
| :---- | :--------------------------- |
| Right or the on-screen next button | Pause media already playing on the slide, then play the step at the current position. When no step remains, pass the action to Marp. |
| Left or the on-screen previous button | Move back one position and reset that step. When no step remains, pass the action to Marp. |
| Up or Down | Never consume a media step. Pass the action directly to Marp. |

Up and Down do not change the media sequence position or pause media by themselves. Marp may reveal or hide a fragment before changing slides; sequential playback does not override that normal order. If Marp leaves the slide, the slide-change reset pauses and rewinds its audio and video, cancels pending spectrogram playback, restores GIF posters, and clears the sequence position.

Before a Right or on-screen next action starts its selected step, native audio and video keep the position at which they are paused. An animated GIF returns to its poster because browsers cannot pause an image animation in place.

Resetting pauses and rewinds audio or video and restores a GIF poster. A failed media load still consumes its step so navigation cannot become stuck.

Manual play controls remain available, but they do not move the arrow-controlled position. A later Right or on-screen next action still pauses manually started media before it plays the selected sequence step.

Only unmodified Left and Right keys and Marp's previous/next buttons participate in sequential playback. Up, Down, and other navigation inputs keep their normal Marp behavior. Arrow keys are also left to a focused media control, button, form field, wavegram player, or editable element.

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

Four Right or on-screen next actions select the GIF, plain audio, spectrogram audio, and video. The following Right or on-screen next action reaches the next Marp fragment or slide.

## Spectrogram And Standalone HTML

Wavegram must load a spectrogram source before playing it. A sequence request made during loading is applied when the player becomes ready.
Spectrogram sources load when their slide becomes visible, including slides with sequential
playback disabled. Hidden slides suspend canvas work and retain their existing player.
Leaving a slide cancels any pending playback request, so a late load cannot start hidden audio.

Local spectrogram paths are resolved relative to the Markdown file. Remote sources must permit cross-origin fetching. To embed all supported assets into one HTML file, use:

```bash
npx marp-tmu-cs --standalone slides.md -o slides.html
```

Sequential playback is an HTML runtime feature. PDF and PPTX output do not provide arrow-controlled media steps.
