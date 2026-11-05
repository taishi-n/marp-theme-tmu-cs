import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    assert.match(output, /<audio controls="" src="data:audio\/wav;base64,[^"]+"><\/audio>/);
    assert.match(output, /<iframe class="demo-frame" title="Demo" srcdoc="/);
    assert.match(output, /window\.__demoLoaded = true;/);
    assert.match(output, /data:image\/png;base64/);
    assert.ok(!output.includes('src="./demo.html"'));
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('inlineStandaloneAssets embeds and caches remote assets', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-standalone-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');

    const html = '<section><img src="https://example.com/image.png"><audio src="https://example.com/tone.mp3"></audio></section>';
    let fetchCount = 0;
    const output = inlineStandaloneAssets(html, {
      markdownPath,
      outputPath: markdownPath,
      fetchRemoteAsset: (reference) => {
        fetchCount += 1;
        return {
          buffer: Buffer.from(reference.includes('image') ? 'image' : 'audio'),
          mimeType: reference.includes('image') ? 'image/png' : 'audio/mpeg',
        };
      },
    });

    assert.doesNotMatch(output, /https:\/\/example\.com/);
    assert.match(output, /data:image\/png;base64,/);
    assert.match(output, /data:audio\/mpeg;base64,/);
    assert.equal(fetchCount, 2);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('inlineStandaloneAssets fails when an asset cannot be embedded', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-standalone-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');

    assert.throws(() => inlineStandaloneAssets('<img src="./missing.png">', {
      markdownPath,
      fetchRemoteAsset: () => null,
    }), /standalone mode could not embed/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('standalone CSS imports embed their nested fonts and reject import cycles', () => {
  const assets = new Map([
    ['https://example.com/css/main.css', { mimeType: 'text/css', buffer: Buffer.from('@import url("./fonts.css");') }],
    ['https://example.com/css/fonts.css', { mimeType: 'text/css', buffer: Buffer.from('@font-face { src: url("../font.woff2"); }') }],
    ['https://example.com/font.woff2', { mimeType: 'font/woff2', buffer: Buffer.from('font') }],
  ]);
  const output = inlineStandaloneAssets('<svg><style>@import url("https://example.com/css/main.css");</style></svg>', {
    fetchRemoteAsset: reference => assets.get(reference),
  });
  const decodeCss = value => Buffer.from(value.match(/data:text\/css;base64,([A-Za-z0-9+/=]+)/u)[1], 'base64').toString();
  const fonts = decodeCss(decodeCss(output));
  assert.match(fonts, /data:font\/woff2;base64,/u);
  assert.doesNotMatch(fonts, /https:|\.\.\//u);

  assets.set('https://example.com/css/fonts.css', { mimeType: 'text/css', buffer: Buffer.from('@import url("./main.css");') });
  assert.throws(() => inlineStandaloneAssets('<style>@import url("https://example.com/css/main.css");</style>', {
    fetchRemoteAsset: reference => assets.get(reference),
  }), /circular CSS import/u);
});

test('inlineStandaloneAssets inlines Kroki SVG images for standalone output', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-standalone-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');

    const html = '<section><img src="https://kroki.io/mermaid/svg/example" alt="diagram"></section>';
    const output = inlineStandaloneAssets(html, {
      markdownPath,
      outputPath: markdownPath,
      fetchRemoteAsset: (reference) => {
        assert.equal(reference, 'https://kroki.io/mermaid/svg/example');
        return {
          buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 480 240"><path d="M0 0L480 240"/></svg>'),
          mimeType: 'image/svg+xml',
        };
      },
    });

    assert.match(output, /<img src="data:image\/svg\+xml;base64,[^"]+" alt="diagram">/);
    assert.doesNotMatch(output, /https:\/\/kroki\.io\/mermaid\/svg\/example/);
    const encoded = output.match(/data:image\/svg\+xml;base64,([^"]+)/u)[1];
    const svg = Buffer.from(encoded, 'base64').toString();
    assert.match(svg, /width="480"/u);
    assert.match(svg, /height="240"/u);
    assert.match(svg, /<path d="M0 0L480 240"/u);

    for (const [dimensions, expectedWidth, expectedHeight] of [
      ['width="100%" height="100"', 200, 100],
      ['width="600" height="300"', 600, 300],
      ['width="360pt" height="180pt"', '360pt', '180pt'],
    ]) {
      const embedded = inlineStandaloneAssets(html, {
        markdownPath,
        fetchRemoteAsset: () => ({
          buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${dimensions} viewBox="0 0 480 240"/>`),
          mimeType: 'image/svg+xml',
        }),
      });
      const xml = Buffer.from(embedded.match(/data:image\/svg\+xml;base64,([^"]+)/u)[1], 'base64').toString();
      assert.ok(xml.includes(`width="${expectedWidth}"`));
      assert.ok(xml.includes(`height="${expectedHeight}"`));
      assert.ok(xml.endsWith('/>'));
    }
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('inlineStandaloneAssets preserves data URLs in srcset and embeds link assets', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-standalone-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');
    await writeFile(join(tempDir, 'icon.png'), Buffer.from('icon'));
    await writeFile(join(tempDir, 'large.png'), Buffer.from('large'));
    const existing = 'data:image/png;base64,QUFBQQ==';
    const html = `<link rel="icon" href="./icon.png"><img srcset="${existing} 1x, ./large.png 2x">`;

    const output = inlineStandaloneAssets(html, { markdownPath });

    assert.match(output, /<link rel="icon" href="data:image\/png;base64,/);
    assert.match(output, /srcset="data:image\/png;base64,QUFBQQ== 1x, data:image\/png;base64,[^"]+ 2x"/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('inlineStandaloneAssets rejects non-portable blob URLs', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-standalone-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');

    assert.throws(
      () => inlineStandaloneAssets('<img src="blob:https://example.com/id">', { markdownPath }),
      /left embeddable references unresolved/,
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('inlineStandaloneAssets requires trust before reading assets outside the input root', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-standalone-'));

  try {
    const deckDir = join(tempDir, 'deck');
    await writeFile(join(tempDir, 'outside.png'), Buffer.from('outside'));
    await mkdir(deckDir);
    const markdownPath = join(deckDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');
    const html = '<img src="../outside.png">';

    assert.throws(
      () => inlineStandaloneAssets(html, { markdownPath }),
      /outside the input root/,
    );
    assert.match(
      inlineStandaloneAssets(html, { allowLocalFiles: true, markdownPath }),
      /src="data:image\/png;base64,/,
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
