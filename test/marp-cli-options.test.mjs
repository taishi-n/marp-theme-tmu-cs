import assert from 'node:assert/strict';
import test from 'node:test';
import { enginePath, themePath } from '../index.mjs';
import { applyTmuCsDefaults } from '../scripts/marp-cli-options.mjs';

test('applyTmuCsDefaults injects engine and theme-set when omitted', () => {
  assert.deepEqual(
    applyTmuCsDefaults(['slides.md', '-o', 'slides.html']),
    ['slides.md', '-o', 'slides.html', '--engine', enginePath, '--theme-set', themePath],
  );
});

test('applyTmuCsDefaults preserves explicit engine and theme-set values', () => {
  assert.deepEqual(
    applyTmuCsDefaults([
      '--engine',
      '/tmp/custom-engine.mjs',
      '--theme-set=/tmp/custom-theme.css',
      'slides.md',
    ]),
    ['--engine', '/tmp/custom-engine.mjs', '--theme-set=/tmp/custom-theme.css', 'slides.md'],
  );
});
