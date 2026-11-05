import { splitLinesPreservingEOF } from './text-lines.mjs';
import { parseMarkdownBlocks } from './markdown-blocks.mjs';

export function parseFenceStart(line) {
  const match = String(line ?? '').match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) return null;

  return {
    marker: match[1][0],
    length: match[1].length,
    info: match[2] ?? '',
  };
}

export function isFenceClose(line, fence) {
  if (!fence) return false;

  const match = String(line ?? '').match(/^ {0,3}(`{3,}|~{3,})\s*$/);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

export function isHorizontalRule(line) {
  return /^ {0,3}(?:(?:-\s*){3,}|(?:_\s*){3,}|(?:\*\s*){3,})$/.test(String(line ?? ''));
}

function normalizeSlides(slides = []) {
  if (slides.length === 0) return [''];
  return slides.map((slide) => (typeof slide === 'string' ? slide : slide.content));
}

export function splitMarkdownSlides(markdown) {
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(markdown);
  const tokens = parseMarkdownBlocks(markdown);
  const bodyStart = tokens[0]?.type === 'front_matter' ? tokens[0].map[1] : 0;
  const slides = [];
  let start = bodyStart;
  for (const token of tokens) {
    if (token.type !== 'hr' || token.level !== 0) continue;
    slides.push({ content: lines.slice(start, token.map[0]).join('\n'), startLine: start + 1 });
    start = token.map[1];
  }
  slides.push({ content: lines.slice(start).join('\n'), startLine: start + 1 });
  return {
    frontMatter: lines.slice(0, bodyStart).join('\n'),
    slides,
    hasTrailingNewline,
  };
}

export function joinMarkdownSlides({ frontMatter = '', slides = [], hasTrailingNewline = false }) {
  const joinedSlides = normalizeSlides(slides).join('\n\n---\n\n');
  const joined = frontMatter === '' ? joinedSlides : `${frontMatter}\n${joinedSlides}`;
  return hasTrailingNewline ? `${joined}\n` : joined;
}

// Standalone authoring comments, using the same protected blocks as Core.
export function standaloneComments(markdown) {
  const lines = String(markdown ?? '').split(/\r?\n/u);
  return parseMarkdownBlocks(markdown)
    .filter((token) => token.type === 'marpit_comment' && token.map[1] === token.map[0] + 1)
    .map((token) => ({ lineIndex: token.map[0], line: lines[token.map[0]] }));
}

export function findStandaloneDirectives(markdown, name) {
  const pattern = new RegExp(`^\\s*<!--\\s*${name}\\s*:\\s*(.*?)\\s*-->\\s*$`, 'u');
  return standaloneComments(markdown).flatMap(({ lineIndex, line }) => {
    const match = line.match(pattern);
    return match ? [{ lineIndex, value: match[1].trim() }] : [];
  });
}
