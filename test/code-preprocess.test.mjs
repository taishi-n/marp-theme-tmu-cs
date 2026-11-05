import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { parseFragment } from 'parse5';
import { Marp } from '@marp-team/marp-core';
import engine from '../engine.mjs';
import { preprocessCodeMarkdown } from '../src/features/code/index.mjs';
import { codeLayoutMetrics } from '../src/features/code/layout-metrics.mjs';

function findElements(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.childNodes ?? []).flatMap(child => findElements(child, predicate))];
}

function elementClasses(node) {
  return (node.attrs?.find(attr => attr.name === 'class')?.value ?? '').split(/\s+/u);
}

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

test('rendered external code preserves blank lines', async () => {
  const marp = await engine({ marp: new Marp() });
  const { html } = marp.render('[sample.cpp](cpp/sample.cpp)\n', {
    file: { absolutePath: join(process.cwd(), 'examples', 'slides.md') },
  });

  assert.match(html, /<span class="line">\u200b<\/span>/);
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
      const highlighted = lines.filter(node => elementClasses(node).includes('highlighted'));
      assert.ok(highlighted.length >= 2, 'all visual segments of logical line 2 are highlighted');
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

test('fit-height uses wrapped visual lines and actual theme dimensions', async () => {
  const marp = await engine({ marp: new Marp() });
  const lines = Array.from({ length: 22 }, (_, index) => `line_${index} = ${'x'.repeat(90)}`).join('\n');
  const { html } = marp.render(`# Heading\n\n\`\`\`cpp fit-height\n${lines}\n\`\`\`\n`);

  assert.match(html, /class="tmu-code-fit-height"/);
  const scale = Number(html.match(/--tmu-code-scale:([\d.]+)/u)?.[1]);
  assert.ok(scale > 0 && scale < 1);
});

test('code layout metrics stay synchronized with theme custom properties', async () => {
  const css = await readFile(join(process.cwd(), 'theme', 'tmu-cs.css'), 'utf8');
  const expectedProperties = {
    bodyBlockGapPx: '--tmu-cs-layout-body-block-gap',
    bodyFontSizePx: '--tmu-cs-layout-body-font-size',
    bodyLineHeightPx: '--tmu-cs-layout-body-line-height',
    codeFontSizePx: '--tmu-cs-layout-code-font-size',
    codeLineHeightPx: '--tmu-cs-layout-code-line-height',
    codeMarginBottomPx: '--tmu-cs-layout-code-margin-bottom',
    codePaddingXPx: '--tmu-cs-layout-code-padding-x',
    codePaddingYPx: '--tmu-cs-layout-code-padding-y',
    slideContentHeightPx: '--tmu-cs-layout-content-height',
  };

  for (const [metric, property] of Object.entries(expectedProperties)) {
    assert.match(css, new RegExp(`${property}:\\s*${codeLayoutMetrics[metric]}px`, 'u'));
  }
});
