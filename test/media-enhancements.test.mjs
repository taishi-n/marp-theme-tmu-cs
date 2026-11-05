import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { parseFragment } from 'parse5';
import enhanceAnimatedImages from '../src/pipeline/animated-images.mjs';

function firstAttributes(html, tagName) {
  function find(node) {
    if (node.tagName === tagName) return Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
    for (const child of node.childNodes || []) {
      const attributes = find(child);
      if (attributes) return attributes;
    }
    return null;
  }
  return find(parseFragment(html));
}

function createSequentialPlaybackHarness(runtime) {
  const events = [];
  const listeners = new Map();

  class FakeElement {
    constructor(name) {
      this.classList = { contains: () => false };
      this.currentTime = 0;
      this.dataset = {};
      this.name = name;
      this.paused = true;
    }

    closest() {
      return null;
    }

    hasAttribute() {
      return false;
    }

    matches() {
      return false;
    }

    pause() {
      events.push(`pause:${this.name}`);
      this.paused = true;
    }

    play() {
      events.push(`play:${this.name}`);
      this.paused = false;
      return Promise.resolve();
    }
  }

  const steps = [new FakeElement('first'), new FakeElement('second')];
  const section = {
    querySelectorAll: () => steps,
  };
  const activeSlide = {
    querySelector: () => section,
  };
  const document = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    body: { dataset: {} },
    documentElement: {},
    querySelector: (selector) => (
      selector === '.bespoke-marp-slide.bespoke-marp-active' ? activeSlide : null
    ),
    querySelectorAll: () => [],
  };
  const window = {
    addEventListener: () => {},
  };

  runInNewContext(runtime, {
    document,
    Element: FakeElement,
    MutationObserver: class {
      observe() {}
    },
    setTimeout: (callback) => callback(),
    window,
  });

  events.length = 0;
  const target = new FakeElement('target');
  const pressKey = (key) => {
    let defaultPrevented = false;
    let propagationStopped = false;
    listeners.get('keydown')({
      altKey: false,
      ctrlKey: false,
      key,
      metaKey: false,
      preventDefault: () => {
        defaultPrevented = true;
      },
      repeat: false,
      shiftKey: false,
      stopImmediatePropagation: () => {
        propagationStopped = true;
      },
      target,
    });
    return { defaultPrevented, propagationStopped };
  };

  return { events, pressKey, steps };
}

test('enhanceAnimatedImages emits spectrogram markup and a self-contained wavegram runtime', () => {
  const html = '<section><p><audio class="demo wavesurfer-spectrogram" controls src="./tone.wav" data-spectrogram-height="120" data-spectrogram-fft-samples="2048"></audio></p></section>';
  const output = enhanceAnimatedImages(html);

  assert.match(output, /<div class="tmu-cs-spectrogram-player" data-wavegram-spectrogram-player>/);
  assert.deepEqual(firstAttributes(output, 'audio'), {
    class: 'demo wavesurfer-spectrogram', src: './tone.wav',
    'data-spectrogram-height': '120', 'data-spectrogram-fft-samples': '2048', preload: 'none',
  });
  assert.doesNotMatch(output, /<audio[^>]*controls/);
  assert.deepEqual(firstAttributes(output, 'wavegram-player'), {
    'data-wavegram-player': '', rendering: 'suspended', 'color-map': 'magma',
    'spectrogram-height': '120', 'fft-size': '2048',
  });
  assert.match(output, /customElements\.define\("wavegram-player"/);
  assert.match(output, /const sourceUrl = resolveAudioSource\(audio\)/);
  assert.match(output, /wavegram\.setAttribute\('src', sourceUrl\)/);
  assert.match(output, /\(function \(Worker\)/);
  assert.doesNotMatch(output, /<p>\s*<div class="tmu-cs-spectrogram-player"/);
});

test('enhanceAnimatedImages leaves plain audio unchanged', () => {
  const html = '<section><audio controls src="./tone.wav"></audio></section>';
  const output = enhanceAnimatedImages(html);

  assert.equal(output, html);
});

test('enhanceAnimatedImages injects a valid sequential navigation runtime for marked media', () => {
  const html = [
    '<section data-media-playback="sequential">',
    '<audio controls src="./one.wav"></audio>',
    '<video controls src="./two.mp4"></video>',
    '</section>',
  ].join('');
  const output = enhanceAnimatedImages(html);
  const runtime = output.match(/<script>([\s\S]*)<\/script>$/u)?.[1];

  assert.ok(runtime);
  assert.match(runtime, /function playNextStep\(section\)/u);
  assert.match(runtime, /pausePlayingSteps\(section\);[\s\S]*playStep\(steps\[position\]\);/u);
  assert.match(runtime, /event\.key === 'ArrowRight'/u);
  assert.match(runtime, /data-bespoke-marp-osc="next"/u);
  assert.match(runtime, /'audio',[\s\S]*'video'/u);
  assert.doesNotThrow(() => Function(runtime));
});

test('sequential navigation pauses current media before playing the next step', () => {
  const html = [
    '<section data-media-playback="sequential">',
    '<audio controls src="./one.wav"></audio>',
    '<video controls src="./two.mp4"></video>',
    '</section>',
  ].join('');
  const output = enhanceAnimatedImages(html);
  const runtime = output.match(/<script>([\s\S]*)<\/script>$/u)?.[1];

  assert.ok(runtime);
  const { events, pressKey, steps } = createSequentialPlaybackHarness(runtime);

  steps[1].play();
  events.length = 0;
  pressKey('ArrowRight');
  assert.deepEqual(events, ['pause:second', 'play:first']);

  steps[0].currentTime = 4;
  events.length = 0;
  pressKey('ArrowRight');

  assert.deepEqual(events, ['pause:first', 'play:second']);
  assert.equal(steps[0].paused, true);
  assert.equal(steps[0].currentTime, 4);
  assert.equal(steps[1].paused, false);
});

test('vertical arrows bypass sequential media playback', () => {
  const html = [
    '<section data-media-playback="sequential">',
    '<audio controls src="./one.wav"></audio>',
    '<video controls src="./two.mp4"></video>',
    '</section>',
  ].join('');
  const output = enhanceAnimatedImages(html);
  const runtime = output.match(/<script>([\s\S]*)<\/script>$/u)?.[1];

  assert.ok(runtime);
  for (const key of ['ArrowDown', 'ArrowUp']) {
    const { events, pressKey, steps } = createSequentialPlaybackHarness(runtime);
    const eventState = pressKey(key);

    assert.deepEqual(events, []);
    assert.deepEqual(eventState, { defaultPrevented: false, propagationStopped: false });
    assert.equal(steps[0].paused, true);

    pressKey('ArrowRight');
    assert.equal(steps[0].paused, false);
  }
});

test('enhanceAnimatedImages inlines local spectrogram audio when markdownPath is known', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-spectrogram-'));

  try {
    const examplesDir = join(tempDir, 'examples');
    const assetsDir = join(examplesDir, 'assets');
    const markdownPath = join(examplesDir, 'slides.md');
    const audioPath = join(assetsDir, 'tone.wav');
    await mkdir(assetsDir, { recursive: true });
    await writeFile(markdownPath, '# demo\n');
    await writeFile(audioPath, Buffer.from('wav-data'));

    const html = '<section><audio class="wavesurfer-spectrogram" src="./assets/tone.wav"></audio></section>';
    const output = enhanceAnimatedImages(html, { markdownPath });

    assert.match(firstAttributes(output, 'audio').src, /^data:audio\/wav;base64,[^"]+$/);
    assert.equal((output.match(/data:audio\/wav;base64,/gu) ?? []).length, 1);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('spectrogram configuration reaches wavegram before runtime loading', () => {
  const output = enhanceAnimatedImages('<section><audio class="wavesurfer-spectrogram" src="tone.wav" data-wavegram-color-map="viridis" data-wavegram-hop-size="128" data-wavegram-min-db="-75" data-wavegram-max-db="-15" data-wavegram-show-waveform="false"></audio></section>');
  const attributes = firstAttributes(output, 'wavegram-player');
  assert.equal(attributes['color-map'], 'viridis');
  assert.equal(attributes['hop-size'], '128');
  assert.equal(attributes['min-db'], '-75');
  assert.equal(attributes['max-db'], '-15');
  assert.equal(attributes['show-waveform'], 'false');
  assert.equal(attributes.rendering, 'suspended');
  assert.equal(attributes.src, undefined);
});

test('enhanceAnimatedImages preserves GIF identity and accessibility attributes', () => {
  const html = '<section><img id="demo-gif" class="demo" src="./demo.gif" alt="Demo animation" title="Demo" data-kind="result" aria-describedby="caption"></section>';
  const output = enhanceAnimatedImages(html);

  assert.match(output, /<span id="demo-gif" title="Demo" data-kind="result" aria-describedby="caption" class="tmu-cs-gif-player demo"/);
  assert.match(output, /role="group" aria-label="Demo animation"/);
  assert.match(output, /<button type="button" class="tmu-cs-gif-play-button" aria-label="Play animation">/);
  assert.match(output, /<template data-gif-image-template><img class="demo" alt="Demo animation" title="Demo" data-kind="result" aria-describedby="caption"><\/template>/);
});

test('enhanceAnimatedImages does not substitute a same-basename audio file', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-spectrogram-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');
    await writeFile(join(tempDir, 'tone.wav'), Buffer.from('unrelated'));
    const warnings = [];
    const output = enhanceAnimatedImages(
      '<section><audio class="wavesurfer-spectrogram" src="./missing/tone.wav"></audio></section>',
      { markdownPath, onWarning: (message) => warnings.push(message) },
    );

    assert.match(output, /src="\.\/missing\/tone\.wav"/);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /was not found/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('enhanceAnimatedImages requires trust before reading audio outside the input root', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-spectrogram-'));

  try {
    const deckDir = join(tempDir, 'deck');
    await mkdir(deckDir);
    const markdownPath = join(deckDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');
    await writeFile(join(tempDir, 'outside.wav'), Buffer.from('outside'));
    const html = '<audio class="wavesurfer-spectrogram" src="../outside.wav"></audio>';
    const warnings = [];

    const untrustedOutput = enhanceAnimatedImages(html, {
      markdownPath,
      onWarning: (message) => warnings.push(message),
    });
    const trustedOutput = enhanceAnimatedImages(html, { allowLocalFiles: true, markdownPath });

    assert.match(untrustedOutput, /src="\.\.\/outside\.wav"/);
    assert.match(warnings[0], /outside the input root/);
    assert.match(trustedOutput, /src="data:audio\/wav;base64,/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
