import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { Marp } from '@marp-team/marp-core';
import engine from '../engine.mjs';
import { preprocessCodeMarkdown } from '../src/features/code/index.mjs';
import { attributes, elementClasses, findElements, parseFragment, textContent } from '../test-support/html.mjs';

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

    assert.equal(processed.split('\n\n---\n\n').length, 4);
    assert.match(processed, /```cpp\nint external_value = 7;\n```/);
    assert.ok(!processed.includes('[!step'));
    assert.match(processed, /\[!code highlight]/);
    assert.match(processed, /\[!code focus]/);
    assert.match(processed, /```cpp\nint a = 0;\nint b = 1;\n```/);
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

  assert.equal(processed.split('\n\n---\n\n').length, 3);
  assert.ok(!processed.includes('[!step'));
  assert.match(processed, /```python\nvalue = 1\ntotal = value \+ 2\n```/);
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

  assert.equal(processed.split('\n\n---\n\n').length, 3);
  assert.match(processed, /```cpp\nint value = 1; \/\/ keep this comment\nint total = value \+ 2; \/\/ and this one\n```/);
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

  assert.equal(processed.split('\n\n---\n\n').length, 3);
  assert.ok(!processed.includes('[!step'));
  assert.match(processed, /```sql\nSELECT \*\nFROM users\n```/);
  assert.match(processed, /-- \[!code highlight]/);
  assert.match(processed, /-- \[!code info]/);
});

test('step expansion preserves languages without supported line comments', () => {
  const markdown = [
    '```html',
    '<div></div> <!-- [!step 1 highlight] -->',
    '```',
    '',
  ].join('\n');

  const processed = preprocessCodeMarkdown(markdown);

  assert.equal(processed, markdown);
});

test('rendered external code preserves blank lines', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-code-blank-'));
  try {
    await writeFile(join(tempDir, 'sample.cpp'), 'int a = 1;\n\nint b = 2;\n');
    const markdownPath = join(tempDir, 'slides.md');
    const source = '[sample.cpp](./sample.cpp)\n';
    await writeFile(markdownPath, source);
    const marp = await engine();
    const { html } = marp.render(source, {
      file: { absolutePath: markdownPath },
    });
    const lines = findElements(parseFragment(html), node => elementClasses(node).includes('line'));
    assert.deepEqual(lines.map(line => textContent(line).replace(/\u200b/gu, '')), ['int a = 1;', '', 'int b = 2;']);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('native line metadata survives external code, steps, and visual wrapping', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-code-meta-'));
  try {
    const markdownPath = join(tempDir, 'slides.md');
    const source = '```cpp {2} path="./sample.cpp"\n```';
    await writeFile(markdownPath, source);
    await writeFile(join(tempDir, 'sample.cpp'), `int first = 1; // [!step 1 warning]\nconst char* text = "${'x'.repeat(160)}";\n`);
    const marp = await engine();
    const { html } = marp.render(source, { file: { absolutePath: markdownPath } });
    const sections = findElements(parseFragment(html), node => node.tagName === 'section');
    assert.equal(sections.length, 2);
    for (const [index, section] of sections.entries()) {
      const lines = findElements(section, node => elementClasses(node).includes('line'));
      assert.equal(textContent(lines[0]), 'int first = 1;');
      assert.ok(!elementClasses(lines[0]).includes('highlighted'));
      const wrapped = lines.slice(1);
      assert.ok(wrapped.length > 1, 'logical line 2 wraps into multiple visual segments');
      assert.ok(wrapped.every(node => elementClasses(node).includes('highlighted')), 'every segment of logical line 2 is highlighted');
      assert.equal(wrapped.map(textContent).join(''), `const char* text = "${'x'.repeat(160)}";`);
      assert.equal(lines.filter(node => elementClasses(node).includes('is-warning')).length, index);
    }
    assert.doesNotMatch(html, /\[!step|\[!code/u);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('Core languages and unknown fences share the wrapping adapter', async () => {
  const marp = await engine();
  const { html } = marp.render('```powershell\nWrite-Host "hello"\n```\n\n```unknown-language\n<untrusted>\n' + 'x'.repeat(150) + '\n```');
  assert.match(html, /class="language-powershell"/u);
  assert.match(html, /color:var\(--marp-shiki-token-function\)/u);
  assert.match(html, /&lt;untrusted&gt;/u);
  assert.match(html, /data-wrapped="true"/u);
});

test('external code cannot escape the markdown input root without explicit trust', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-code-root-'));

  try {
    const deckDir = join(tempDir, 'deck');
    await mkdir(deckDir);
    const markdownPath = join(deckDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');
    await writeFile(join(tempDir, 'outside.py'), 'print("outside")\n');
    const markdown = '```python path="../outside.py"\n```\n';

    assert.throws(() => preprocessCodeMarkdown(markdown, { markdownPath }), /outside the input root/);
    assert.match(
      preprocessCodeMarkdown(markdown, { allowLocalFiles: true, markdownPath }),
      /print\("outside"\)/,
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('external code rejects a symlink that resolves outside the input root', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-code-root-'));

  try {
    const deckDir = join(tempDir, 'deck');
    await mkdir(deckDir);
    const markdownPath = join(deckDir, 'slides.md');
    await writeFile(markdownPath, '# demo\n');
    await writeFile(join(tempDir, 'outside.py'), 'print("outside")\n');
    await symlink(join(tempDir, 'outside.py'), join(deckDir, 'linked.py'));

    assert.throws(
      () => preprocessCodeMarkdown('```python path="./linked.py"\n```\n', { markdownPath }),
      /outside the input root/,
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('diagram source bypasses generic code wrapping in the integrated engine', async () => {
  const marp = await engine({ marp: new Marp() });
  const diagramSource = `@startuml\nAlice -> Bob: ${'A'.repeat(131)}\n@enduml\n`;
  const { html } = marp.render(`\`\`\`plantuml\n${diagramSource}\`\`\`\n`);
  const encoded = html.match(/kroki\.io\/plantuml\/svg\/([^"/]+)/u)?.[1];

  assert.ok(encoded);
  assert.equal(inflateSync(Buffer.from(encoded, 'base64url')).toString('utf8'), diagramSource);
});

test('fit-height shrinks with visual line count and remaining slide space', async () => {
  const marp = await engine();
  function renderCode(code, heading = '# Heading') {
    const { html } = marp.render(`${heading}\n\n\`\`\`cpp fit-height\n${code}\n\`\`\`\n`);
    const root = parseFragment(html);
    const fit = findElements(root, node => elementClasses(node).includes('tmu-code-fit-height'))[0];
    return {
      lineCount: findElements(root, node => elementClasses(node).includes('line')).length,
      scale: fit ? Number(attributes(fit).style.match(/--tmu-code-scale:([\d.]+)/u)?.[1]) : 1,
    };
  }
  const short = renderCode('int x = 1;');
  const long = renderCode(Array(22).fill('int x = 1;').join('\n'));
  const longer = renderCode(Array(44).fill('int x = 1;').join('\n'));
  assert.equal(short.scale, 1, 'a short block retains its natural size');
  assert.ok(longer.scale > 0 && longer.scale < long.scale && long.scale < short.scale);

  const wrapped = renderCode(Array(22).fill(`const char* text = "${'x'.repeat(90)}";`).join('\n'));
  assert.ok(wrapped.lineCount > long.lineCount);
  const explicit = renderCode(Array(wrapped.lineCount).fill('int x = 1;').join('\n'));
  assert.equal(wrapped.scale, explicit.scale, 'wrapped and explicit visual lines consume the same height');
  assert.ok(renderCode(Array(22).fill('int x = 1;').join('\n'), '').scale > long.scale, 'headings reduce the space available to code');
});
