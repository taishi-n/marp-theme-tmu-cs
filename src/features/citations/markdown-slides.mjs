import { splitLinesPreservingEOF } from '../../core/text-lines.mjs';

function parseFrontMatterLines(lines) {
  if (lines[0]?.trim() !== '---') {
    return {
      frontMatterLines: [],
      bodyLines: lines,
    };
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (['---', '...'].includes(lines[index].trim())) {
      return {
        frontMatterLines: lines.slice(0, index + 1),
        bodyLines: lines.slice(index + 1),
      };
    }
  }

  return {
    frontMatterLines: [],
    bodyLines: lines,
  };
}

function parseFenceStart(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) return null;

  return {
    marker: match[1][0],
    length: match[1].length,
  };
}

function isFenceClose(line, fence) {
  if (!fence) return false;

  const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

function isHorizontalRule(line) {
  return /^ {0,3}(?:(?:-\s*){3,}|(?:_\s*){3,}|(?:\*\s*){3,})$/.test(line);
}

export function splitSlides(markdown) {
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(markdown);
  const { frontMatterLines, bodyLines } = parseFrontMatterLines(lines);
  const slides = [];
  let currentLines = [];
  let fence = null;

  for (const line of bodyLines) {
    if (!fence) {
      const fenceStart = parseFenceStart(line);

      if (fenceStart) {
        fence = fenceStart;
        currentLines.push(line);
        continue;
      }

      if (isHorizontalRule(line)) {
        slides.push(currentLines.join('\n'));
        currentLines = [];
        continue;
      }

      currentLines.push(line);
      continue;
    }

    currentLines.push(line);
    if (isFenceClose(line, fence)) fence = null;
  }

  slides.push(currentLines.join('\n'));

  return {
    frontMatter: frontMatterLines.join('\n'),
    slides,
    hasTrailingNewline,
  };
}

export function joinSlides({ frontMatter, slides, hasTrailingNewline }) {
  const parts = [];
  const normalizedSlides = slides.length > 0 ? slides : [''];

  if (frontMatter !== '') parts.push(frontMatter);
  parts.push(normalizedSlides.join('\n\n---\n\n'));

  const joined = parts.filter((part, index) => index === 0 || part !== '').join('\n\n');
  return hasTrailingNewline ? `${joined}\n` : joined;
}
