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
