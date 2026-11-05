import assert from 'node:assert/strict';
import test from 'node:test';
import { Marp } from '@marp-team/marp-core';
import engine from '../engine.mjs';

const source = '# Emoji\n\n:smile: 😄 `😄`\n\n```text\n😄\n```';

test('HTML uses native emoji and preserves Core constructor options', async () => {
  const supplied = new Marp({ slug: (text) => `custom-${text.toLowerCase()}` });
  const marp = await engine({ marp: supplied });
  const { html } = marp.render(source);
  assert.doesNotMatch(html, /data-marp-twemoji/u);
  assert.match(html, /😄 😄/u);
  assert.match(html, /id="custom-emoji"/u);
  assert.equal(supplied.options.emoji.unicode, 'twemoji');
});

test('CLI getter receives native emoji options before Core initialization', async () => {
  let instances = 0;
  const options = { html: true, emoji: { twemoji: { base: '/emoji/' } } };
  Object.defineProperty(options, 'marp', { get() {
    instances += 1;
    return new Marp(options);
  } });
  const marp = await engine(options);
  assert.equal(instances, 1);
  assert.equal(marp.options.emoji.twemoji.base, '/emoji/');
  assert.doesNotMatch(marp.render(source).html, /data-marp-twemoji/u);
});

test('non-HTML output modes preserve the Core Twemoji renderer', async () => {
  const previous = process.env.TMU_CS_OUTPUT_FORMAT;
  try {
    for (const format of ['pdf', 'pptx']) {
      process.env.TMU_CS_OUTPUT_FORMAT = format;
      const supplied = new Marp();
      const marp = await engine({ marp: supplied });
      assert.equal(marp, supplied);
      const { html } = marp.render(source);
      assert.match(html, /data-marp-twemoji/u);
    }
  } finally {
    if (previous === undefined) delete process.env.TMU_CS_OUTPUT_FORMAT;
    else process.env.TMU_CS_OUTPUT_FORMAT = previous;
  }
});
