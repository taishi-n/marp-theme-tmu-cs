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
