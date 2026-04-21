import assert from 'node:assert/strict';
import test from 'node:test';
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
