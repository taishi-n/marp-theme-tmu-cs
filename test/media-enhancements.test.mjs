import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import enhanceAnimatedImages from '../src/pipeline/animated-images.mjs';

test('enhanceAnimatedImages wraps spectrogram audio with wavegram player markup', () => {
  const html = '<section><p><audio class="demo wavesurfer-spectrogram" controls src="./tone.wav" data-spectrogram-height="120" data-spectrogram-fft-samples="2048"></audio></p></section>';
  const output = enhanceAnimatedImages(html);

  assert.match(output, /<div class="tmu-cs-spectrogram-player" data-wavegram-spectrogram-player>/);
  assert.doesNotMatch(output, /data-wavegram-play(?:=|\s|>)/);
  assert.doesNotMatch(output, /data-wavegram-stop(?:=|\s|>)/);
  assert.doesNotMatch(output, /data-wavegram-time(?:=|\s|>)/);
  assert.doesNotMatch(output, /Loading spectrogram/);
  assert.match(output, /<audio class="demo wavesurfer-spectrogram" src="\.\/tone\.wav" data-spectrogram-height="120" data-spectrogram-fft-samples="2048"><\/audio>/);
  assert.doesNotMatch(output, /<audio[^>]*controls/);
  assert.match(output, /<wavegram-player data-wavegram-player="" spectrogram-height="120" fft-size="2048"><\/wavegram-player>/);
  assert.doesNotMatch(output, /waveform-height=/);
  assert.doesNotMatch(output, /color-map=/);
  assert.match(output, /customElements\.define\("wavegram-player"/);
  assert.match(output, /const sourceUrl = resolveAudioSource\(audio\)/);
  assert.match(output, /wavegram\.setAttribute\('src', sourceUrl\)/);
  assert.match(output, /\(function \(Worker\)/);
  assert.doesNotMatch(output, /function handleWavegramSeekClick\(wavegram, event\)/);
  assert.doesNotMatch(output, /cdn\.jsdelivr\.net\/npm\/wavesurfer\.js/);
  assert.doesNotMatch(output, /<p>\s*<div class="tmu-cs-spectrogram-player"/);
});

test('enhanceAnimatedImages leaves plain audio unchanged', () => {
  const html = '<section><audio controls src="./tone.wav"></audio></section>';
  const output = enhanceAnimatedImages(html);

  assert.equal(output, html);
});

test('enhanceAnimatedImages installs sequential navigation for marked plain media', () => {
  const html = [
    '<section>',
    '<audio controls src="./one.wav"></audio>',
    '<video controls src="./two.mp4"></video>',
    '<span class="tmu-cs-slide-class--media-playback-sequential"></span>',
    '</section>',
  ].join('');
  const output = enhanceAnimatedImages(html);
  const runtime = output.match(/<script>([\s\S]*)<\/script>$/u)?.[1];

  assert.ok(runtime);
  assert.match(runtime, /function playNextStep\(section\)/u);
  assert.match(runtime, /event\.key === 'ArrowRight'/u);
  assert.match(runtime, /data-bespoke-marp-osc="next"/u);
  assert.match(runtime, /'audio',[\s\S]*'video'/u);
  assert.doesNotThrow(() => Function(runtime));
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

    assert.match(output, /<audio class="wavesurfer-spectrogram" src="data:audio\/wav;base64,[^"]+"><\/audio>/);
    assert.equal((output.match(/data:audio\/wav;base64,/gu) ?? []).length, 1);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
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
