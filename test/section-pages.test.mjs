import assert from 'node:assert/strict';
import test from 'node:test';
import { Marp } from '@marp-team/marp-core';
import engine from '../engine.mjs';
import applySectionPages from '../src/pipeline/section-pages.mjs';
import decorateAuxiliarySlides from '../src/pipeline/slide-metadata.mjs';

test('applySectionPages inserts auxiliary section pages before section headings', () => {
  const markdown = [
    '---',
    'sectionPages: true',
    'sectionPageLevel: 2',
    '---',
    '',
    '# Title',
    '',
    '---',
    '',
    '## Basics',
    '',
    '### Lists',
    '',
    '---',
    '',
    '## Code',
    '',
  ].join('\n');

  const processed = applySectionPages(markdown);

  assert.match(processed, /# Basics <span class="tmu-cs-slide-class--section-page tmu-cs-slide-class--auxiliary-page"><\/span>\n(?:\n)+---\n(?:\n)+### Lists/);
  assert.match(processed, /# Code <span class="tmu-cs-slide-class--section-page tmu-cs-slide-class--auxiliary-page"><\/span>\n*$/);
});

test('applySectionPages merges comment-only section intro slides into the section page', () => {
  const markdown = [
    '---',
    'sectionPages: true',
    'sectionPageLevel: 2',
    '---',
    '',
    '## Basics',
    '',
    '<!--',
    'Speaker note for the section page.',
    '-->',
    '',
    '---',
    '',
    '### Lists',
    '',
  ].join('\n');

  const processed = applySectionPages(markdown);

  assert.match(processed, /# Basics <span class="tmu-cs-slide-class--section-page tmu-cs-slide-class--auxiliary-page"><\/span>\n+(?:<!--\nSpeaker note for the section page\.\n-->)/);
  assert.doesNotMatch(processed, /---\n(?:\n)*<!--\nSpeaker note for the section page\.\n-->\n(?:\n)*---/);
});

test('applySectionPages expands toc command for the current section when level is specified and marks the slide auxiliary', () => {
  const markdown = [
    '---',
    'sectionPages: true',
    'sectionPageLevel: 2',
    '---',
    '',
    '## Basics',
    '',
    '### Lists',
    '',
    '---',
    '',
    '# Agenda',
    '',
    '<!-- toc level=3 -->',
    '',
    '---',
    '',
    '### Tables',
    '',
  ].join('\n');

  const processed = applySectionPages(markdown);

  assert.match(processed, /<span class="tmu-cs-slide-class--toc-page tmu-cs-slide-class--auxiliary-page"><\/span>/);
  assert.match(processed, /# Agenda <span class="tmu-cs-slide-class--toc-page tmu-cs-slide-class--auxiliary-page"><\/span>\n\n- \[Lists\]\(#tmu-cs-toc-\d+\)\n- \[Tables\]\(#tmu-cs-toc-\d+\)/);
});

test('applySectionPages expands a deck-level toc before the first section and skips references section pages', () => {
  const markdown = [
    '---',
    'sectionPages: true',
    'sectionPageLevel: 2',
    '---',
    '',
    '# Agenda',
    '',
    '<!-- toc -->',
    '',
    '---',
    '',
    '## Basic usage',
    '',
    '### Lists',
    '',
    '---',
    '',
    '## Theme-specific syntax',
    '',
    '### Code',
    '',
    '---',
    '',
    '## References',
    '',
  ].join('\n');

  const processed = applySectionPages(markdown);

  assert.match(processed, /# Agenda <span class="tmu-cs-slide-class--toc-page tmu-cs-slide-class--auxiliary-page"><\/span>\n\n- \[Basic usage\]\(#tmu-cs-toc-\d+\)\n- \[Theme-specific syntax\]\(#tmu-cs-toc-\d+\)\n- \[References\]\(#tmu-cs-toc-\d+\)/);
  assert.match(processed, /# Basic usage(?: <span data-tmu-cs-heading="\d+"><\/span>)? <span class="tmu-cs-slide-class--section-page tmu-cs-slide-class--auxiliary-page"><\/span>/);
  assert.match(processed, /# Theme-specific syntax(?: <span data-tmu-cs-heading="\d+"><\/span>)? <span class="tmu-cs-slide-class--section-page tmu-cs-slide-class--auxiliary-page"><\/span>/);
  assert.doesNotMatch(processed, /# References <span class="tmu-cs-slide-class--section-page tmu-cs-slide-class--auxiliary-page"><\/span>/);
});

test('applySectionPages allows overriding toc max level per command', () => {
  const markdown = [
    '---',
    'sectionPages: true',
    'sectionPageLevel: 2',
    '---',
    '',
    '# Agenda',
    '',
    '<!-- toc level=3 -->',
    '',
    '---',
    '',
    '## Basic usage',
    '',
    '### Lists',
    '',
    '---',
    '',
    '## Theme-specific syntax',
    '',
    '### Code',
    '',
  ].join('\n');

  const processed = applySectionPages(markdown);

  assert.match(processed, /- \[Basic usage\]\(#tmu-cs-toc-\d+\)\n {2}- \[Lists\]\(#tmu-cs-toc-\d+\)\n- \[Theme-specific syntax\]\(#tmu-cs-toc-\d+\)\n {2}- \[Code\]\(#tmu-cs-toc-\d+\)/);
});

test('applySectionPages excludes fit headings from toc output', () => {
  const markdown = [
    '# Table of contents',
    '',
    '<!-- toc -->',
    '',
    '---',
    '',
    '# <!--fit--> Huge<br />Words',
    '',
    '---',
    '',
    '# Normal heading',
    '',
  ].join('\n');

  const processed = applySectionPages(markdown);

  assert.doesNotMatch(processed, /\[<!--fit--> Huge<br \/>Words\]\(#hugewords\)/);
  assert.match(processed, /- \[Normal heading\]\(#tmu-cs-toc-\d+\)/);
});

test('applySectionPages ignores inline toc syntax examples in prose and tables', () => {
  const markdown = [
    '---',
    'sectionPages: true',
    'sectionPageLevel: 2',
    'tocPageMaxLevel: 2',
    '---',
    '',
    '## Directives',
    '',
    '### Deck-level directives',
    '',
    '| Key | Purpose |',
    '| :-- | :------ |',
    '| `tocPageMaxLevel` | Limit how deep `<!-- toc -->` expands by default |',
    '',
    '---',
    '',
    '### Inline commands',
    '',
    '- `<!-- toc -->`: insert a TOC using the deck default depth',
    '- `<!-- toc level=3 -->`: override the TOC depth for one page',
    '',
    '```md',
    '<!-- toc -->',
    '```',
    '',
  ].join('\n');

  const processed = applySectionPages(markdown);

  assert.match(processed, /\| `tocPageMaxLevel` \| Limit how deep `<!-- toc -->` expands by default \|/);
  assert.match(processed, /- `<!-- toc -->`: insert a TOC using the deck default depth/);
  assert.match(processed, /- `<!-- toc level=3 -->`: override the TOC depth for one page/);
  assert.match(processed, /```md\n<!-- toc -->\n```/);
  assert.doesNotMatch(processed, /<span class="tmu-cs-slide-class--toc-page tmu-cs-slide-class--auxiliary-page"><\/span>/);
});

test('applySectionPages assigns distinct target references to repeated headings', () => {
  const markdown = [
    '# Agenda',
    '',
    '<!-- toc -->',
    '',
    '---',
    '',
    '## Duplicate',
    '',
    '---',
    '',
    '## Duplicate',
    '',
  ].join('\n');

  const processed = applySectionPages(markdown);

  assert.match(processed, /- \[Duplicate\]\(#tmu-cs-toc-\d+\)\n- \[Duplicate\]\(#tmu-cs-toc-\d+\)/);
});

test('applySectionPages preserves front matter directives such as theme', () => {
  const markdown = [
    '---',
    'marp: true',
    'theme: tmu-cs',
    'sectionPages: true',
    'sectionPageLevel: 2',
    '---',
    '',
    '## Basics',
    '',
    '### Lists',
    '',
  ].join('\n');

  const processed = applySectionPages(markdown);

  assert.match(processed, /^---\nmarp: true\ntheme: tmu-cs\nsectionPages: true\nsectionPageLevel: 2\n---/);
});

test('engine excludes auxiliary pages and respects authored pagination directives', async () => {
  const marp = await engine({ marp: new Marp() });
  const { html } = marp.render([
    '---', 'paginate: true', 'title: Deck', 'sectionPages: true', '---',
    '# Agenda', '<!-- toc -->', '---', '## Basics', '---',
    '### First', '---', '<!-- _paginate: hold -->', '### Held', '---',
    '<!-- _paginate: skip -->', '### Skipped', '---',
    '<!-- _paginate: false -->', '### Hidden', '---', '### Last',
  ].join('\n'));
  const sections = html.match(/<section\b[^>]*>/gu);
  assert.equal(sections.length, 8);
  assert.match(sections[0], /data-marpit-pagination="1"/u);
  for (const index of [1, 2, 5, 6]) assert.doesNotMatch(sections[index], /data-marpit-pagination=/u);
  assert.match(sections[3], /data-marpit-pagination="2"/u);
  assert.match(sections[4], /data-marpit-pagination="2"/u);
  assert.match(sections[7], /data-marpit-pagination="4"/u);
  for (const index of [0, 3, 4, 7]) assert.match(sections[index], /data-marpit-pagination-total="4"/u);
  assert.match(html, /<header data-section-name="Basics">Deck<\/header>/u);
});

test('auxiliary pagination does not enable pagination on an unpaginated deck', async () => {
  const marp = await engine({ marp: new Marp() });
  const { html } = marp.render('<!-- _class: auxiliary-page -->\n# Auxiliary\n\n---\n# Content');
  assert.doesNotMatch(html, /data-marpit-pagination=/u);
});

test('applySectionPages recognizes all supported reference headings', () => {
  for (const heading of ['Reference', 'References', 'Bibliography', 'Works Cited', '参考文献']) {
    const markdown = [
      '---',
      'sectionPages: true',
      'sectionPageLevel: 2',
      '---',
      '',
      `## ${heading}`,
      '',
    ].join('\n');
    assert.doesNotMatch(applySectionPages(markdown), /tmu-cs-slide-class--section-page/);
  }
});

test('decorateAuxiliarySlides preserves nested section elements inside slides', () => {
  const html = [
    '<section id="1"><header>Deck</header><section class="embedded"><p>Nested</p></section></section>',
    '<section id="2"><header>Deck</header></section>',
  ].join('');
  const output = decorateAuxiliarySlides(html);

  assert.doesNotMatch(output, /data-marpit-pagination/u);
  assert.match(output, /<section class="embedded"><p>Nested<\/p><\/section>/);
});

test('TOC links use rendered heading IDs across title collisions, code steps and Unicode', async () => {
  const marp = await engine({ marp: new Marp() });
  const source = [
    '---', 'title: Duplicate', 'sectionPages: true', '---',
    '# Agenda', '<!-- toc level=3 -->', '---',
    '## Duplicate', '---', '### `foo_bar`', '---',
    '### 日本語', '---', '### 1', '---',
    '### Step', '```js', 'let x = 1; // [!step 1 highlight]', '```', '---',
    '### Step', '---', '# Another agenda', '<!-- toc level=3 -->',
  ].join('\n');
  const { html } = marp.render(source);
  const ids = [...html.matchAll(/<h[1-6]\b[^>]*\bid="([^"]+)"/gu)].map((match) => match[1]);
  const links = [...html.matchAll(/<a href="#([^"]+)">/gu)].map((match) => match[1]);
  assert.deepEqual(links.slice(0, 6), ['duplicate-1', 'foo_bar', encodeURI('日本語'), '1-1', 'step', 'step-2']);
  for (const link of links) assert.ok(ids.includes(link), `Missing heading for ${link}`);
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotMatch(html, /data-tmu-cs-heading|tmu-cs-toc-|tmu-cs-slide-class--/u);
  assert.equal(marp.render(source).html, html);
});

test('TOC respects custom Core slug options and falls back to slide anchors without slugs', async () => {
  for (const slug of [(text) => `custom-${text.trim().toLowerCase()}`, false]) {
    const marp = await engine({ marp: new Marp({ slug }) });
    const { html } = marp.render('# Agenda\n<!-- toc -->\n---\n## Destination');
    assert.match(html, slug ? /href="#custom-destination"/u : /href="#2"/u);
  }
});
