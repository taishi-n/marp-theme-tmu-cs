import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import inlineStandaloneAssets from '../src/pipeline/standalone-assets.mjs';

test('inlineStandaloneAssets inlines local media and local iframe HTML', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-standalone-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    const imagePath = join(tempDir, 'image.png');
    const audioPath = join(tempDir, 'tone.wav');
    const iframeHtmlPath = join(tempDir, 'demo.html');
    const iframeScriptPath = join(tempDir, 'demo.js');

    await writeFile(markdownPath, '# demo\n');
    await writeFile(imagePath, Buffer.from('png-data'));
    await writeFile(audioPath, Buffer.from('wav-data'));
    await writeFile(iframeScriptPath, 'window.__demoLoaded = true;\n');
    await writeFile(
      iframeHtmlPath,
      '<!doctype html><html><head><script src="./demo.js"></script></head><body><img src="./image.png"></body></html>',
    );

    const html = [
      '<section>',
      '<img src="./image.png" alt="image">',
      '<audio controls src="./tone.wav"></audio>',
      '<iframe class="demo-frame" src="./demo.html" title="Demo"></iframe>',
      '</section>',
    ].join('');

    const output = inlineStandaloneAssets(html, {
      markdownPath,
      outputPath: markdownPath,
    });

    assert.match(output, /<img src="data:image\/png;base64,[^"]+"/);
    assert.match(output, /<audio controls src="data:audio\/wav;base64,[^"]+"><\/audio>/);
    assert.match(output, /<iframe class="demo-frame" title="Demo" srcdoc="/);
    assert.match(output, /window\.__demoLoaded = true;/);
    assert.match(output, /data:image\/png;base64/);
    assert.ok(!output.includes('src="./demo.html"'));
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('inlineStandaloneAssets leaves remote assets unchanged', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-standalone-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');

    const html = '<section><img src="https://example.com/image.png"><audio src="https://example.com/tone.mp3"></audio></section>';
    const output = inlineStandaloneAssets(html, {
      markdownPath,
      outputPath: markdownPath,
    });

    assert.equal(output, html);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
