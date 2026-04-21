import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import enhanceAnimatedImages from '../src/pipeline/animated-images.mjs';

test('enhanceAnimatedImages wraps wavesurfer spectrogram audio with player markup', () => {
  const html = '<section><p><audio class="demo wavesurfer-spectrogram" controls src="./tone.wav" data-spectrogram-height="120" data-spectrogram-fft-samples="2048"></audio></p></section>';
  const output = enhanceAnimatedImages(html);

  assert.match(output, /<div class="tmu-cs-spectrogram-player" data-wavesurfer-spectrogram-player>/);
  assert.match(output, /data-wavesurfer-play/);
  assert.match(output, /data-wavesurfer-stop/);
  assert.match(output, /data-wavesurfer-time/);
  assert.match(output, /<audio class="demo wavesurfer-spectrogram" src="\.\/tone\.wav" data-spectrogram-height="120" data-spectrogram-fft-samples="2048"><\/audio>/);
  assert.doesNotMatch(output, /<audio[^>]*controls/);
  assert.match(output, /tmu-cs-spectrogram-player__waveform/);
  assert.match(output, /tmu-cs-spectrogram-player__spectrogram/);
  assert.match(output, /splitChannels: true/);
  assert.match(output, /labelsBackground: accentColor/);
  assert.match(output, /fftSamples = parsePositiveInteger\(audio\.dataset\.spectrogramFftSamples, 1024\)/);
  assert.match(output, /frequencyMax: 0/);
  assert.match(output, /colorMap: 'roseus'/);
  assert.match(output, /const sourceUrl = resolveAudioSource\(audio\)/);
  assert.match(output, /wavesurfer\.load\(sourceUrl\)/);
  assert.match(output, /cdn\.jsdelivr\.net\/npm\/wavesurfer\.js@7\.12\.6/);
  assert.doesNotMatch(output, /<p>\s*<div class="tmu-cs-spectrogram-player"/);
});

test('enhanceAnimatedImages leaves plain audio unchanged', () => {
  const html = '<section><audio controls src="./tone.wav"></audio></section>';
  const output = enhanceAnimatedImages(html);

  assert.equal(output, html);
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

    const html = '<section><audio class="wavesurfer-spectrogram" src="../assets/tone.wav"></audio></section>';
    const output = enhanceAnimatedImages(html, { markdownPath });

    assert.match(output, /<audio class="wavesurfer-spectrogram" src="data:audio\/wav;base64,[^"]+"><\/audio>/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
