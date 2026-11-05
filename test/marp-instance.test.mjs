import assert from 'node:assert/strict';
import test from 'node:test';
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
