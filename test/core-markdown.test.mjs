import assert from 'node:assert/strict';
import test from 'node:test';
import { Marp } from '@marp-team/marp-core/full';
import { parseFrontMatter } from '../src/core/front-matter.mjs';
import { parseMarkdownHeadings } from '../src/core/headings.mjs';
import { joinMarkdownSlides, splitMarkdownSlides } from '../src/core/markdown.mjs';

test('splitMarkdownSlides preserves front matter and ignores slide separators inside fences', () => {
  const markdown = [
    '---',
    'title: Demo',
    '---',
    '',
    '# Slide A',
    '',
    '```md',
    '---',
    '```',
    '',
    '---',
    '',
    '# Slide B',
    '',
  ].join('\n');

  const document = splitMarkdownSlides(markdown);

  assert.equal(document.frontMatter, '---\ntitle: Demo\n---');
  assert.equal(document.slides.length, 2);
  assert.match(document.slides[0].content, /```md\n---\n```/);
  const joined = joinMarkdownSlides(document);

  assert.match(joined, /^---\ntitle: Demo\n---\n\n# Slide A/m);
  assert.match(joined, /\n---\n/);
  assert.match(joined, /\n# Slide B\n$/);
});

test('slide boundaries and headings follow Marp block syntax in notes, math and nested blocks', () => {
  const markdown = '# First\n\n<!-- speaker note\n---\n-->\n\n$$\nx\n---\ny\n$$\n\n> ***\n\n    ---\n\n---\n\nSecond\n======\n';
  const native = new Marp({ html: true }).render(markdown);
  const document = splitMarkdownSlides(markdown);
  assert.equal(document.slides.length, native.comments.length);
  assert.deepEqual(document.slides.map((slide) => slide.startLine), [1, 18]);
  assert.deepEqual(parseMarkdownHeadings(markdown).map(({ level, text }) => ({ level, text })), [
    { level: 1, text: 'First' }, { level: 1, text: 'Second' },
  ]);
});

test('custom front matter fields support YAML document-end delimiters', () => {
  const source = '---\nbibliography: refs.bib\nsectionPages: true\n...\n\n# Body\n';
  const parsed = parseFrontMatter(source);
  assert.equal(parsed.data.bibliography, 'refs.bib');
  assert.equal(parsed.data.sectionPages, 'true');
  assert.match(parsed.body, /# Body/);
  assert.equal(parsed.frontMatter + parsed.body, source);
});
