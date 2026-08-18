import assert from 'node:assert/strict';
import test from 'node:test';
import { enginePath, themePath } from '../index.mjs';
import { applyTmuCsDefaults, detectOutputFormat } from '../scripts/marp-cli-options.mjs';

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

test('applyTmuCsDefaults inserts defaults before the option terminator', () => {
  assert.deepEqual(
    applyTmuCsDefaults(['slides.md', '--', '--literal-file.md']),
    ['slides.md', '--engine', enginePath, '--theme-set', themePath, '--', '--literal-file.md'],
  );
});

test('detectOutputFormat recognizes flags and output extensions before the terminator', () => {
  assert.equal(detectOutputFormat(['slides.md', '--images']), 'images');
  assert.equal(detectOutputFormat(['slides.md', '-o', 'slides.pptx']), 'pptx');
  assert.equal(detectOutputFormat(['slides.md', '-o', 'slides.png']), 'image');
  assert.equal(detectOutputFormat(['slides.md', '--', '--pdf']), 'html');
});
