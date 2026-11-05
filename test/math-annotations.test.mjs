import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import { collectMathAnnotations } from '../src/features/math/annotate-math-block.mjs';
import engine from '../engine.mjs';
import { attributes, findElements, parseFragment, textContent } from '../test-support/html.mjs';

test('collectMathAnnotations recognizes !math-annotate directives', () => {
  const result = collectMathAnnotations(
    [
      'X_k % [!math-annotate note="The k-th component"]',
      '= \\sum_{n=0}^{N-1} % [!math-annotate note="Summation"]',
      'x_n',
    ].join('\n'),
  );

  assert.equal(result.annotations.length, 2);
  assert.match(result.math, /\\class\{eqann-1\}\{X_k\}/);
  assert.match(result.math, /\\class\{eqann-2\}\{= \\sum_\{n=0\}\^\{N-1\}\}/);
});

test('annotation note math uses the deck renderer and remains safe to embed', async () => {
  const marp = await engine();
  const source = String.raw`---
math: mathjax
---
$$
f(x) = x^2 % [!math-annotate note="Map $\mathbb{R} \to \mathbb{R}$ <img src=x>"]
$$

$$
y = 1 % [!math-annotate note="Water $\ce{H2O}$"]
$$`;
  for (let render = 0; render < 2; render += 1) {
    const { html } = marp.render(source);
    const payloads = [...html.matchAll(/<script type="application\/json" class="eqann-data">([\s\S]*?)<\/script>/gu)]
      .map(match => JSON.parse(match[1]));
    assert.equal(payloads.length, 2);
    assert.equal(payloads[0][0].note, String.raw`Map $\mathbb{R} \to \mathbb{R}$ <img src=x>`);
    assert.match(payloads[0][0].noteHtml, /data-c="2192"/u);
    for (const [annotation] of payloads) {
      assert.match(annotation.noteHtml, /class="eqann-inline-math"><mjx-container/u);
      assert.match(annotation.noteHtml, /<svg\b/u);
      assert.match(annotation.noteHtml, /<path\b/u);
      assert.doesNotMatch(annotation.noteHtml, /data-mjx-error|data-mml-node="merror"/u);
    }
    assert.match(payloads[0][0].noteHtml, /&lt;img src=x&gt;/u);
    const runtimes = findElements(parseFragment(html), node => node.tagName === 'section')
      .flatMap(section => findElements(section, node => node.tagName === 'script' && attributes(node).type !== 'application/json'));
    assert.equal(runtimes.length, 1, 'all annotation blocks share one runtime per deck');
    const bindings = [];
    const context = {
      document: { readyState: 'loading', addEventListener: type => bindings.push(`document:${type}`) },
      window: { addEventListener: type => bindings.push(`window:${type}`) },
    };
    const runtime = new Script(textContent(runtimes[0]));
    runtime.runInNewContext(context);
    runtime.runInNewContext(context);
    for (const binding of ['document:DOMContentLoaded', 'window:load']) {
      assert.equal(bindings.filter(value => value === binding).length, 1, 'reloading the runtime does not duplicate initialization');
    }
  }
});
