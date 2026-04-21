import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as pkg from '../index.mjs';

test('index exports only the minimal public surface', () => {
  assert.deepEqual(
    Object.keys(pkg).sort(),
    ['defaultCslPath', 'enginePath', 'marpEngine', 'themeName', 'themePath'],
  );
});

test('package exports expose only top-level package entrypoints', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.deepEqual(
    Object.keys(packageJson.exports).sort(),
    ['.', './csl/ieee.csl', './engine', './engine.mjs', './theme', './theme.css', './theme/tmu-cs.css'],
  );
});
