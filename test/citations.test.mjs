import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultCslPath } from '../index.mjs';
import { preprocessCitationMarkdown } from '../src/features/citations/index.mjs';

const bibliography = `
@article{demo2024,
  author = {Doe, Jane},
  title = {Demo Citation},
  journal = {Journal of Tests},
  year = {2024},
  doi = {10.1000/demo}
}
`.trim();

test('citationDisplay selects citation footnotes, a bibliography, or both while preserving authored footnotes', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-citation-display-'));
  try {
    await writeFile(join(tempDir, 'refs.bib'), bibliography);
    for (const citationDisplay of ['footnotes', 'bibliography', 'both']) {
      const processed = preprocessCitationMarkdown('# Intro\nA citation [@demo2024] and a note[^detail].\n\n[^detail]: Authored explanation\n\n---\n\n# References\n\n::: {#refs}\n:::\n', {
        defaultCslPath,
        frontMatter: { bibliography: 'refs.bib', citationDisplay },
        markdownPath: join(tempDir, 'slides.md'),
      });
      const beforeReferences = processed.split('# References')[0];
      assert.match(beforeReferences, /Authored explanation/);
      assert.equal(beforeReferences.includes('Demo Citation'), citationDisplay !== 'bibliography');
      assert.equal(processed.includes('citation-bibliography-list'), citationDisplay !== 'footnotes');
      assert.equal(processed.includes('# References'), citationDisplay !== 'footnotes');
      if (citationDisplay === 'bibliography') assert.match(beforeReferences, /footnote-ref">\[1\]/);
    }
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('bibliography-only citation numbers refer to the same entries across slides', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-citation-numbers-'));
  try {
    await writeFile(join(tempDir, 'refs.bib'), bibliography + '\n@article{other2025, author={Roe, John}, title={Other Citation}, journal={Tests}, year={2025}}\n');
    const processed = preprocessCitationMarkdown('# First\nOther [@other2025].\n\n---\n\n# Second\nDemo [@demo2024], other [@other2025]. Locator [see @other2025, p. 12].\n', {
      defaultCslPath,
      frontMatter: { bibliography: 'refs.bib', citationDisplay: 'bibliography' },
      markdownPath: join(tempDir, 'slides.md'),
    });
    const entries = [...processed.matchAll(/<li class="citation-bibliography-item">([\s\S]*?)<\/li>/g)].map((match) => match[1]);
    const otherNumber = entries.findIndex((entry) => entry.includes('Other Citation')) + 1;
    assert.ok(otherNumber > 0);
    assert.equal((processed.match(new RegExp('citation-ref">\\[' + otherNumber + '\\]','g')) ?? []).length, 2);
    const locatorCitation = processed.match(/Locator <span class="citation-ref">([^<]+)<\/span>/)?.[1] ?? '';
    assert.match(locatorCitation, /see /);
    assert.match(locatorCitation, new RegExp('\\[' + otherNumber + '\\]'));
    assert.match(locatorCitation, /p\. 12/);
    assert.doesNotMatch(processed, /citation-footnotes-marker/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('citationDisplay rejects unknown modes instead of silently dropping references', () => {
  assert.throws(() => preprocessCitationMarkdown('# Slide', { frontMatter: { citationDisplay: 'unknown' } }), /citationDisplay must be/);
});

test('preprocessCitationMarkdown fills an explicit references placeholder', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-citations-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(join(tempDir, 'refs.bib'), `${bibliography}\n`);

    const markdown = [
      '# Intro',
      '',
      'This is a citation [@demo2024].',
      '',
      '---',
      '',
      '# References',
      '',
      '::: {#refs}',
      ':::',
      '',
    ].join('\n');

    const processed = preprocessCitationMarkdown(markdown, {
      defaultCslPath,
      frontMatter: {
        bibliography: 'refs.bib',
      },
      markdownPath,
    });

    assert.match(processed, /<span class="citation-ref">/);
    assert.match(processed, /<ol class="citation-bibliography-list">/);
    assert.ok(!processed.includes('::: {#refs}'));
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('preprocessCitationMarkdown appends a references slide when none is present', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-citations-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(join(tempDir, 'refs.bib'), `${bibliography}\n`);

    const markdown = [
      '# Intro',
      '',
      'This is a citation [@demo2024].',
      '',
    ].join('\n');

    const processed = preprocessCitationMarkdown(markdown, {
      defaultCslPath,
      frontMatter: {
        bibliography: 'refs.bib',
      },
      markdownPath,
    });

    assert.match(processed, /\n# References\n\n<ol class="citation-bibliography-list">/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('preprocessCitationMarkdown fills an empty references heading slide instead of appending another one', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-citations-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(join(tempDir, 'refs.bib'), `${bibliography}\n`);

    const markdown = [
      '# Intro',
      '',
      'This is a citation [@demo2024].',
      '',
      '---',
      '',
      '# References',
      '',
    ].join('\n');

    const processed = preprocessCitationMarkdown(markdown, {
      defaultCslPath,
      frontMatter: {
        bibliography: 'refs.bib',
      },
      markdownPath,
    });

    assert.equal((processed.match(/\n# References\n/g) ?? []).length, 1);
    assert.match(processed, /# References\n\n<ol class="citation-bibliography-list">/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('preprocessCitationMarkdown renders markdown footnotes without bibliography', () => {
  const markdown = [
    '# Intro',
    '',
    'This is a footnote[^demo].',
    '',
    '[^demo]: Footnote body.',
    '',
  ].join('\n');

  const processed = preprocessCitationMarkdown(markdown, {
    frontMatter: {},
  });

  assert.match(processed, /<sup class="footnote-ref">\[1\]<\/sup>/);
  assert.match(processed, /<div class="citation-footnotes-marker"/);
  assert.match(processed, /<span class="citation-footnote-label">\[1\]<\/span> Footnote body\./);
});

test('preprocessCitationMarkdown preserves markdown and inline HTML inside footnotes', () => {
  const markdown = [
    '# Intro',
    '',
    'This is a footnote[^demo].',
    '',
    '[^demo]: Inline math $x$ and <mark>mark</mark> stay renderable.',
    '',
  ].join('\n');

  const processed = preprocessCitationMarkdown(markdown, {
    frontMatter: {},
  });

  assert.match(processed, /<span class="citation-footnote-label">\[1\]<\/span> Inline math \$x\$ and <mark>mark<\/mark> stay renderable\./);
  assert.doesNotMatch(processed, /&lt;mark&gt;|&lt;\/mark&gt;|\$x\$ and &lt;/);
});

test('preprocessCitationMarkdown warns when a footnote definition is on another slide', () => {
  const markdown = [
    '# Intro',
    '',
    'This is a footnote[^demo].',
    '',
    '---',
    '',
    '[^demo]: Footnote body.',
    '',
  ].join('\n');

  const warnings = [];
  const processed = preprocessCitationMarkdown(markdown, {
    frontMatter: {},
    onWarning: ({ message }) => warnings.push(message),
  });

  assert.match(processed, /<sup class="footnote-ref">\[1\]<\/sup>/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /must be defined in the same slide as its reference/);
});

test('citation detection ignores protected Markdown regions', () => {
  const markdown = [
    '# Examples',
    '',
    '```text',
    '[@inside-fence]',
    '```',
    '',
    '`[@inline-code]`',
    '',
    '<!-- [@comment] -->',
    '',
    '[@link-label](https://example.com)',
    '',
  ].join('\n');

  assert.equal(preprocessCitationMarkdown(markdown, { frontMatter: {} }), markdown);
});

test('citations and Markdown footnotes share first-occurrence numbering and one list', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-citations-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(join(tempDir, 'refs.bib'), `${bibliography}\n`);
    const markdown = [
      '# Intro',
      '',
      'Manual first[^manual], then citation [@demo2024].',
      '',
      '[^manual]: Manual footnote.',
      '',
    ].join('\n');

    const processed = preprocessCitationMarkdown(markdown, {
      defaultCslPath,
      frontMatter: { bibliography: 'refs.bib' },
      markdownPath,
    });

    assert.match(processed, /<sup class="footnote-ref">\[1\]<\/sup>/);
    assert.match(processed, /<span class="citation-ref">\[2\]<\/span>/);
    assert.equal((processed.match(/citation-footnotes-marker/gu) ?? []).length, 1);
    assert.match(processed, /\[1\]<\/span> Manual footnote\.[\s\S]*\[2\]<\/span>.*Demo Citation/u);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('citation detection supports prefixes without treating bracketed email text as a citation', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-citations-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(join(tempDir, 'refs.bib'), `${bibliography}\n`);
    const markdown = [
      '# Intro',
      '',
      'See [e.g. @demo2024], but keep [contact@example] unchanged.',
      '',
    ].join('\n');

    const processed = preprocessCitationMarkdown(markdown, {
      defaultCslPath,
      frontMatter: { bibliography: 'refs.bib' },
      markdownPath,
    });

    assert.match(processed, /<span class="citation-ref">/);
    assert.match(processed, /\[contact@example\]/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('unused footnote definitions do not shift citation numbering', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-citations-'));

  try {
    const markdownPath = join(tempDir, 'slides.md');
    await writeFile(join(tempDir, 'refs.bib'), `${bibliography}\n`);
    const markdown = [
      '# Intro',
      '',
      '[^unused]: This definition is intentionally unused.',
      '',
      'Citation [@demo2024].',
      '',
    ].join('\n');

    const processed = preprocessCitationMarkdown(markdown, {
      defaultCslPath,
      frontMatter: { bibliography: 'refs.bib' },
      markdownPath,
    });

    assert.match(processed, /<span class="citation-ref">\[1\]<\/span>/);
    assert.doesNotMatch(processed, /This definition is intentionally unused/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
