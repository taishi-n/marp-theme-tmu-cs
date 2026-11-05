import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import enhanceAnimatedImages from '../src/pipeline/animated-images.mjs';
import { linkAudioDownload } from '../src/pipeline/audio-download.mjs';
import { attributes, elementClasses, findElements, parseFragment, textContent } from '../test-support/html.mjs';

function firstAttributes(html, tagName) {
  return attributes(findElements(parseFragment(html), node => node.tagName === tagName)[0]);
}

const sequentialMedia = '<section data-media-playback="sequential"><p id="caption">Media</p><audio id="first" controls src="./one.wav"></audio><video id="second" controls src="./two.mp4"></video></section>';

function createMediaHarness(output = enhanceAnimatedImages(sequentialMedia), { active = true } = {}) {
  const events = [];
  const listeners = new Map();
  const observers = [];
  const registrations = new Map();

  class FakeElement {
    constructor(node, parent = null) {
      this.tagName = node.tagName;
      this.attributes = attributes(node);
      this.parentElement = parent;
      this.children = (node.childNodes ?? []).filter(child => child.tagName).map(child => new FakeElement(child, this));
      this.classList = {
        contains: name => (this.attributes.class ?? '').split(/\s+/u).includes(name),
        add: name => { this.attributes.class = `${this.attributes.class ?? ''} ${name}`; },
      };
      this.currentTime = 0;
      this.dataset = Object.fromEntries(Object.entries(this.attributes).filter(([name]) => name.startsWith('data-'))
        .map(([name, value]) => [name.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase()), value]));
      this.name = this.attributes.id ?? this.tagName;
      this.paused = true;
      this.disabled = this.hasAttribute('disabled');
    }

    closest(selector) {
      for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
      return null;
    }

    getAttribute(name) { return this.attributes[name] ?? null; }
    hasAttribute(name) { return name in this.attributes; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    get src() { return this.attributes.src ?? ''; }
    blur() {}
    addEventListener(type, listener) { listeners.set(`${this.name}:${type}`, listener); }

    matches(selector) {
      return selector.split(',').some(part => {
        const match = part.trim().match(/^([a-z][a-z\d-]*)?((?:\.[\w-]+)*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/iu);
        assert.ok(match, `Unsupported fixture selector: ${part}`);
        const [, tag, classes, attribute, value] = match;
        return (!tag || tag === this.tagName) &&
          classes.split('.').filter(Boolean).every(name => this.classList.contains(name)) &&
          (!attribute || (this.hasAttribute(attribute) && (value === undefined || this.getAttribute(attribute) === value)));
      });
    }

    querySelectorAll(selector) {
      return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

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

  const root = new FakeElement(parseFragment(`<div class="marpit"><div class="bespoke-marp-slide${active ? ' bespoke-marp-active' : ''}">${output}</div></div>
    <button data-bespoke-marp-osc="next" disabled><span class="next-icon">Next</span></button>`));
  const runtime = findElements(parseFragment(output), node => node.tagName === 'script').map(textContent).join('\n');
  assert.ok(runtime);
  const document = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    createElement: tagName => new FakeElement({ tagName }),
    body: { dataset: {} },
    documentElement: root,
    querySelector: selector => root.querySelector(selector),
    querySelectorAll: selector => root.querySelectorAll(selector),
  };
  const window = {
    addEventListener: () => {},
  };

  runInNewContext(runtime, {
    document,
    Element: FakeElement,
    HTMLElement: class {},
    customElements: {
      get: name => registrations.get(name),
      define: (name, component) => registrations.set(name, component),
    },
    MutationObserver: class {
      constructor(callback) { observers.push(callback); }
      observe() {}
    },
    setTimeout: (callback) => callback(),
    window,
  });

  events.length = 0;
  const dispatch = (type, details) => {
    let defaultPrevented = false;
    let propagationStopped = false;
    listeners.get(type)({
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => {
        defaultPrevented = true;
      },
      repeat: false,
      shiftKey: false,
      stopImmediatePropagation: () => {
        propagationStopped = true;
      },
      target: root.querySelector('p'),
      ...details,
    });
    return { defaultPrevented, propagationStopped };
  };

  return {
    events, registrations,
    pressKey: key => dispatch('keydown', { key }),
    clickNext: () => dispatch('click', { target: root.querySelector('.next-icon') }),
    nextButton: root.querySelector('[data-bespoke-marp-osc="next"]'),
    steps: root.querySelectorAll('audio,video'),
    querySelector: selector => root.querySelector(selector),
    activate: () => {
      const slide = root.querySelector('.bespoke-marp-slide');
      slide.classList.add('bespoke-marp-active');
      for (const observe of observers) observe([{ target: slide, attributeName: 'class' }]);
    },
  };
}

test('enhanceAnimatedImages emits spectrogram markup and a self-contained wavegram runtime', () => {
  const html = '<section><p><audio class="demo wavesurfer-spectrogram" controls src="./tone.wav" data-spectrogram-height="120" data-spectrogram-fft-samples="2048"></audio></p></section>';
  const output = enhanceAnimatedImages(html);

  const root = parseFragment(output);
  const player = findElements(root, node => elementClasses(node).includes('tmu-cs-spectrogram-player'))[0];
  assert.ok('data-wavegram-spectrogram-player' in attributes(player));
  const audio = firstAttributes(output, 'audio');
  for (const [name, value] of Object.entries({
    class: 'demo wavesurfer-spectrogram', src: './tone.wav',
    'data-spectrogram-height': '120', 'data-spectrogram-fft-samples': '2048', preload: 'none',
  })) assert.equal(audio[name], value);
  assert.equal(audio.controls, undefined);
  const wavegram = firstAttributes(output, 'wavegram-player');
  for (const [name, value] of Object.entries({
    'data-wavegram-player': '', rendering: 'suspended', 'color-map': 'magma',
    'spectrogram-height': '120', 'fft-size': '2048',
  })) assert.equal(wavegram[name], value);
  assert.equal(wavegram.src, undefined);
  assert.notEqual(player.parentNode.tagName, 'p');

  const harness = createMediaHarness(output, { active: false });
  assert.equal(typeof harness.registrations.get('wavegram-player'), 'function');
  const component = harness.querySelector('wavegram-player');
  assert.equal(component.getAttribute('src'), null, 'hidden slides defer audio loading');
  harness.activate();
  assert.equal(component.getAttribute('src'), audio.src, 'activation loads the authored audio source');
  assert.equal(component.getAttribute('rendering'), 'active');
});

test('enhanceAnimatedImages leaves plain audio unchanged', () => {
  const html = '<section><audio controls src="./tone.wav"></audio></section>';
  const output = enhanceAnimatedImages(html);

  assert.equal(output, html);
});

test('audio rows label and download the original embedded source without a second audio payload', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-audio-row-'));
  try {
    const bytes = Buffer.from('original audio bytes');
    await writeFile(join(tempDir, 'tone.wav'), bytes);
    const output = enhanceAnimatedImages('<section><audio class="wavesurfer-spectrogram" src="tone.wav" data-audio-label="S0 &amp; S1" data-audio-download="output.wav"></audio></section>', { markdownPath: join(tempDir, 'slides.md') });
    const audioSource = firstAttributes(output, 'audio').src;
    assert.deepEqual(Buffer.from(audioSource.split(',')[1], 'base64'), bytes);
    assert.equal(output.split(audioSource).length - 1, 1);
    const link = firstAttributes(output, 'a');
    assert.equal(link.download, 'output.wav');
    assert.equal(link['aria-label'], 'Download S0 & S1');
    assert.equal(link.href, undefined);
    const linked = {};
    linkAudioDownload({ querySelector: () => ({ setAttribute: (key, value) => { linked[key] = value; } }) }, audioSource);
    assert.equal(linked.href, audioSource);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('sequential keys and next buttons select media in order and pause the previous item', () => {
  for (const control of ['key', 'button']) {
    const { events, pressKey, clickNext, nextButton, steps } = createMediaHarness();
    const advance = control === 'key' ? () => pressKey('ArrowRight') : clickNext;
    assert.equal(nextButton.disabled, false, 'media steps enable next even at the end of a deck');

    steps[1].play();
    events.length = 0;
    assert.deepEqual(advance(), { defaultPrevented: true, propagationStopped: true });
    assert.deepEqual(events, ['pause:second', 'play:first']);

    steps[0].currentTime = 4;
    events.length = 0;
    assert.deepEqual(advance(), { defaultPrevented: true, propagationStopped: true });
    assert.deepEqual(events, ['pause:first', 'play:second']);
    assert.equal(steps[0].paused, true);
    assert.equal(steps[0].currentTime, 4);
    assert.equal(steps[1].paused, false);
    assert.equal(nextButton.disabled, true, 'the original button state is restored after the final step');

    events.length = 0;
    assert.deepEqual(advance(), { defaultPrevented: false, propagationStopped: false });
    assert.deepEqual(events, [], 'navigation proceeds after all media steps');
  }
});

test('vertical arrows bypass sequential media playback', () => {
  for (const key of ['ArrowDown', 'ArrowUp']) {
    const { events, pressKey, steps } = createMediaHarness();
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

  const root = parseFragment(output);
  const player = findElements(root, node => elementClasses(node).includes('tmu-cs-gif-player'))[0];
  const identity = { title: 'Demo', 'data-kind': 'result', 'aria-describedby': 'caption' };
  for (const [name, value] of Object.entries({ ...identity, id: 'demo-gif', role: 'group', 'aria-label': 'Demo animation' })) {
    assert.equal(attributes(player)[name], value);
  }
  assert.ok(elementClasses(player).includes('demo'));
  const buttonNode = findElements(player, node => node.tagName === 'button')[0];
  assert.ok(elementClasses(buttonNode).includes('tmu-cs-gif-play-button'));
  const button = attributes(buttonNode);
  assert.equal(button.type, 'button');
  assert.equal(button['aria-label'], 'Play animation');
  const template = findElements(player, node => node.tagName === 'template' && 'data-gif-image-template' in attributes(node))[0];
  const image = findElements(template, node => node.tagName === 'img')[0];
  for (const [name, value] of Object.entries({ ...identity, alt: 'Demo animation' })) assert.equal(attributes(image)[name], value);
  assert.ok(elementClasses(image).includes('demo'));
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
