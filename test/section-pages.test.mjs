import assert from 'node:assert/strict';
import test from 'node:test';
import applySectionPages from '../src/pipeline/section-pages.mjs';
import recalculateAuxiliaryPagination from '../src/pipeline/auxiliary-pagination.mjs';

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
  assert.match(processed, /# Agenda <span class="tmu-cs-slide-class--toc-page tmu-cs-slide-class--auxiliary-page"><\/span>\n\n- \[Lists\]\(#lists\)\n- \[Tables\]\(#tables\)/);
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

  assert.match(processed, /# Agenda <span class="tmu-cs-slide-class--toc-page tmu-cs-slide-class--auxiliary-page"><\/span>\n\n- \[Basic usage\]\(#basic-usage\)\n- \[Theme-specific syntax\]\(#theme-specific-syntax\)\n- \[References\]\(#references\)/);
  assert.match(processed, /# Basic usage <span class="tmu-cs-slide-class--section-page tmu-cs-slide-class--auxiliary-page"><\/span>/);
  assert.match(processed, /# Theme-specific syntax <span class="tmu-cs-slide-class--section-page tmu-cs-slide-class--auxiliary-page"><\/span>/);
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

  assert.match(processed, /- \[Basic usage\]\(#basic-usage\)\n  - \[Lists\]\(#lists\)\n- \[Theme-specific syntax\]\(#theme-specific-syntax\)\n  - \[Code\]\(#code\)/);
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
  assert.match(processed, /- \[Normal heading\]\(#normal-heading\)/);
});

test('applySectionPages generates GitHub-style unique heading anchors in toc links', () => {
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

  assert.match(processed, /- \[Duplicate\]\(#duplicate\)\n- \[Duplicate\]\(#duplicate-1\)/);
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

test('recalculateAuxiliaryPagination excludes auxiliary pages from visible totals', () => {
  const html = [
    '<section id="1" class="title-slide" data-marpit-pagination="1" data-marpit-pagination-total="4"><header>Deck</header></section>',
    '<section id="2" class="section-page auxiliary-page" data-marpit-pagination="2" data-marpit-pagination-total="4"><header>Deck</header><h1>Basics</h1></section>',
    '<section id="3" data-marpit-pagination="3" data-marpit-pagination-total="4"><header>Deck</header></section>',
    '<section id="4" class="toc-page auxiliary-page" data-marpit-pagination="4" data-marpit-pagination-total="4"></section>',
  ].join('');

  const output = recalculateAuxiliaryPagination(html);

  assert.match(output, /id="1" class="title-slide" data-marpit-pagination="1" data-marpit-pagination-total="2"/);
  assert.match(output, /<section(?=[^>]*id="2")(?=[^>]*class="section-page auxiliary-page")(?=[^>]*data-marpit-pagination="")(?=[^>]*data-marpit-pagination-total="")(?=[^>]*data-paginate="false")[^>]*>/);
  assert.match(output, /id="3" data-marpit-pagination="2" data-marpit-pagination-total="2"/);
  assert.match(output, /<section(?=[^>]*id="3")[^>]*><header data-section-name="Basics">Deck<\/header><\/section>/);
  assert.match(output, /<section(?=[^>]*id="4")(?=[^>]*class="toc-page auxiliary-page")(?=[^>]*data-marpit-pagination="")(?=[^>]*data-marpit-pagination-total="")(?=[^>]*data-paginate="false")[^>]*>/);
});
