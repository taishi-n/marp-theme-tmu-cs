import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getMarkdownPathFromEnv } from '../src/pipeline/markdown-pipeline.mjs';

function makeFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'tmu-cs-markdown-path-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = join(root, 'first.md');
  const second = join(root, 'second.md');
  writeFileSync(first, '# First\n', 'utf8');
  writeFileSync(second, '# Second\r\n', 'utf8');
  return { first, second };
}

test('getMarkdownPathFromEnv prefers an explicit Marp environment path', (t) => {
  const { first, second } = makeFixture(t);

  assert.equal(
    getMarkdownPathFromEnv({ file: { absolutePath: first } }, '# Second\n', [second]),
    first,
  );
});

test('getMarkdownPathFromEnv selects only the configured input whose content matches', (t) => {
  const { first, second } = makeFixture(t);

  assert.equal(getMarkdownPathFromEnv({}, '# Second\n', [first, second]), second);
  assert.equal(getMarkdownPathFromEnv({}, '# Missing\n', [first, second]), undefined);
});
