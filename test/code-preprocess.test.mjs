import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { preprocessCodeMarkdown } from '../src/features/code/index.mjs';

test('preprocessCodeMarkdown expands external code and step slides together', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-code-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(join(tempDir, 'sample.cpp'), 'int external_value = 7;\n');

    const markdown = [
      '[sample.cpp](./sample.cpp)',
      '',
      '---',
      '',
      '```cpp',
      'int a = 0; // [!step 1 highlight]',
      'int b = 1; // [!step 2 focus]',
      '```',
      '',
    ].join('\n');

    const processed = preprocessCodeMarkdown(markdown, {
      markdownPath,
    });

    assert.equal(processed.split('\n\n---\n\n').length, 3);
    assert.match(processed, /```cpp\nint external_value = 7;\n```/);
    assert.ok(!processed.includes('[!step'));
    assert.match(processed, /\[!code highlight]/);
    assert.match(processed, /\[!code focus]/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('preprocessCodeMarkdown infers fence language from external file extension', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-code-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(join(tempDir, 'sample.py'), 'print("hello")\n');

    const markdown = [
      '``` path="./sample.py" fit-height="true"',
      'print("ignored inline code")',
      '```',
      '',
    ].join('\n');

    const warnings = [];
    const processed = preprocessCodeMarkdown(markdown, {
      markdownPath,
      onWarning: (message) => warnings.push(message),
    });

    assert.match(processed, /```python fit-height\nprint\("hello"\)\n```/);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /ignores inline block content/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('preprocessCodeMarkdown expands step slides for python line comments', () => {
  const markdown = [
    '```python',
    'value = 1  # [!step 1 highlight]',
    'total = value + 2  # [!step 2 focus]',
    '```',
    '',
  ].join('\n');

  const processed = preprocessCodeMarkdown(markdown);

  assert.equal(processed.split('\n\n---\n\n').length, 2);
  assert.ok(!processed.includes('[!step'));
  assert.match(processed, /# \[!code highlight]/);
  assert.match(processed, /# \[!code focus]/);
});

test('preprocessCodeMarkdown preserves visible comments before step directives', () => {
  const markdown = [
    '```cpp',
    'int value = 1; // keep this comment [!step 1 highlight]',
    'int total = value + 2; // and this one [!step 2 focus]',
    '```',
    '',
  ].join('\n');

  const processed = preprocessCodeMarkdown(markdown);

  assert.equal(processed.split('\n\n---\n\n').length, 2);
  assert.match(processed, /int value = 1; \/\/ keep this comment \/\/ \[!code highlight]/);
  assert.match(processed, /int total = value \+ 2; \/\/ and this one \/\/ \[!code focus]/);
});

test('preprocessCodeMarkdown expands step slides for sql line comments', () => {
  const markdown = [
    '```sql',
    'SELECT *  -- [!step 1 highlight]',
    'FROM users -- [!step 2 info]',
    '```',
    '',
  ].join('\n');

  const processed = preprocessCodeMarkdown(markdown);

  assert.equal(processed.split('\n\n---\n\n').length, 2);
  assert.ok(!processed.includes('[!step'));
  assert.match(processed, /-- \[!code highlight]/);
  assert.match(processed, /-- \[!code info]/);
});

test('preprocessCodeMarkdown leaves unsupported languages unchanged', () => {
  const markdown = [
    '```html',
    '<div></div> <!-- [!step 1 highlight] -->',
    '```',
    '',
  ].join('\n');

  const processed = preprocessCodeMarkdown(markdown);

  assert.equal(processed, markdown);
});
