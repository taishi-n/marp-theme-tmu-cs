import assert from 'node:assert/strict';
import test from 'node:test';
import { collectMathAnnotations } from '../src/features/math/annotate-math-block.mjs';

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

test('collectMathAnnotations ignores legacy !annotate directives for math', () => {
  const result = collectMathAnnotations(
    'X_k % [!annotate note="Legacy name"]',
  );

  assert.equal(result.annotations.length, 0);
  assert.equal(result.math, 'X_k % [!annotate note="Legacy name"]');
});
