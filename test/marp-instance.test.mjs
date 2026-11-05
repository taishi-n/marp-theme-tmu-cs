import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { Marp } from '@marp-team/marp-core';
import { Marp as FullMarp } from '@marp-team/marp-core/full';
import engine from '../engine.mjs';

test('default, fresh base, and full engines provide math and native diagrams', async () => {
  const source = '---\nmath: mathjax\n---\n# Features\n\n$x^2$\n\n```mermaid\ngraph LR\nA[Start] --> B[Finish]\n```';
  for (const options of [{}, { marp: new Marp() }, { marp: new FullMarp() }]) {
    const marp = await engine(options);
    const { html } = marp.render(source);
    assert.equal((html.match(/<mjx-container\b/gu) ?? []).length, 1);
    assert.equal((html.match(/<svg data-marp-mermaid\b/gu) ?? []).length, 1);
    assert.match(html, /Start/u);
    assert.match(html, /Finish/u);
  }
});

test('CLI-style factory options select the package feature set outside the theme checkout', async () => {
  const cliRequire = createRequire(import.meta.resolve('@marp-team/marp-cli'));
  const { Marp: BundledMarp } = cliRequire('@marp-team/marp-core');
  const options = { html: true, slug: text => `consumer-${text.toLowerCase()}` };
  Object.defineProperty(options, 'marp', { get() {
    return new BundledMarp(options);
  } });
  const marp = await engine(options);
  const { html } = marp.render('# Consumer\n\n```js {2}\nconst a = 1;\nconst b = 2;\n```\n\n```mermaid\ngraph LR\nA --> B\n```');
  assert.match(html, /id="consumer-consumer"/u);
  assert.match(html, /class="line highlighted"/u);
  assert.match(html, /<svg data-marp-mermaid/u);
});
