import assert from 'node:assert/strict';
import test from 'node:test';
import { Marp } from '@marp-team/marp-core';
import engine from '../engine.mjs';
import { annotateSlideSources } from '../src/core/slide-source.mjs';

test('source IDs map generated chapter pages and code states to the original slide', async () => {
  const marp = await engine({ marp: new Marp() });
  const markdown = ['---', 'title: Demo', 'sectionPages: true', 'paginate: true', '---',
    '<!-- slide-id: comparison -->', '## Chapter', '### States', '```js',
    'let a = 1; // [!step 1 highlight]', 'let b = 2; // [!step 2 highlight]', '```',
    '---', '<!-- slide-id: closing -->', '### End'].join('\n');
  const { html } = marp.render(markdown);
  const slides = marp.tmuCsSlides.slides;
  assert.equal(slides.length, 6);
  assert.equal(new Set(slides.map((slide) => slide.id)).size, 6);
  const comparison = slides.filter((slide) => slide.sourceId === 'comparison');
  assert.equal(comparison.length, 4);
  assert.ok(comparison.every((slide) => slide.sourceLine === 6 && slide.sourceSlide === 1));
  assert.deepEqual(comparison.map((slide) => slide.kind), ['section', 'content', 'content', 'content']);
  assert.equal(slides.at(-1).id, 'closing');
  assert.doesNotMatch(html, /data-tmu-cs-source|class="tmu-cs-edit-label"/u);
  marp.render('<!-- slide-id: closing -->\n### End\n---\n<!-- slide-id: comparison -->\n### Start');
  assert.deepEqual(marp.tmuCsSlides.slides.map((slide) => slide.id), ['closing', 'comparison']);
});

test('source metadata preserves an authored title and makes edit labels opt-in', async () => {
  const marp = await engine({ marp: new Marp() });
  const { html } = marp.render('---\ntitle: Demo\neditLabels: true\n---\n<!-- slide-id: cover -->\n# Demo');
  assert.equal(marp.tmuCsSlides.slides.length, 1);
  assert.equal(marp.tmuCsSlides.slides[0].id, 'cover');
  assert.match(html, /class="tmu-cs-edit-label"/u);
});

test('authored source IDs reject duplicates and ignore examples in code fences', () => {
  assert.throws(() => annotateSlideSources('<!-- slide-id: same -->\n# One\n---\n<!-- slide-id: same -->\n# Two'), /duplicate slide-id/);
  assert.throws(() => annotateSlideSources('<!-- slide-id: bad id -->\n# One'), /slide-id must start/);
  assert.doesNotThrow(() => annotateSlideSources('```md\n<!-- slide-id: bad id -->\n```'));
});

test('authored IDs and source lines survive TOC expansion and speaker notes', async () => {
  const marp = await engine({ marp: new Marp() });
  marp.render('<!-- slide-id: contents -->\n# Contents\n<!-- toc -->\n\n<!-- note\n---\n-->\n\n---\n\n<!-- slide-id: body -->\n# Body');
  assert.deepEqual(marp.tmuCsSlides.slides.map(({ id, sourceSlide, sourceLine }) => ({ id, sourceSlide, sourceLine })), [
    { id: 'contents', sourceSlide: 1, sourceLine: 1 },
    { id: 'body', sourceSlide: 2, sourceLine: 10 },
  ]);
});
