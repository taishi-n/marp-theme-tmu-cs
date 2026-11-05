import { splitLinesPreservingEOF } from './text-lines.mjs';

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

function parseFrontMatterLines(lines) {
  if (lines[0]?.trim() !== '---') {
    return {
      bodyLines: lines,
      bodyStartLine: 1,
      frontMatterLines: [],
    };
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (['---', '...'].includes(lines[index].trim())) {
      return {
        bodyLines: lines.slice(index + 1),
        bodyStartLine: index + 2,
        frontMatterLines: lines.slice(0, index + 1),
      };
    }
  }

  return {
    bodyLines: lines,
    bodyStartLine: 1,
    frontMatterLines: [],
  };
}

function normalizeSlides(slides = []) {
  if (slides.length === 0) return [''];
  return slides.map((slide) => (typeof slide === 'string' ? slide : slide.content));
}

export function splitMarkdownSlides(markdown) {
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(markdown);
  const { frontMatterLines, bodyLines, bodyStartLine } = parseFrontMatterLines(lines);
  const slides = [];
  let currentLines = [];
  let currentStartLine = bodyStartLine;
  let fence = null;

  for (let index = 0; index < bodyLines.length; index += 1) {
    const line = bodyLines[index];
    const originalLineNumber = bodyStartLine + index;

    if (!fence) {
      const fenceStart = parseFenceStart(line);

      if (fenceStart) {
        fence = fenceStart;
        currentLines.push(line);
        continue;
      }

      if (isHorizontalRule(line)) {
        slides.push({
          content: currentLines.join('\n'),
          startLine: currentStartLine,
        });
        currentLines = [];
        currentStartLine = originalLineNumber + 1;
        continue;
      }
    } else if (isFenceClose(line, fence)) {
      fence = null;
    }

    currentLines.push(line);
  }

  slides.push({
    content: currentLines.join('\n'),
    startLine: currentStartLine,
  });

  return {
    frontMatter: frontMatterLines.join('\n'),
    slides,
    hasTrailingNewline,
  };
}

export function joinMarkdownSlides({ frontMatter = '', slides = [], hasTrailingNewline = false }) {
  const joinedSlides = normalizeSlides(slides).join('\n\n---\n\n');
  const joined = frontMatter === '' ? joinedSlides : `${frontMatter}\n${joinedSlides}`;
  return hasTrailingNewline ? `${joined}\n` : joined;
}

// Read opt-in authoring comments without consuming examples inside fences or notes.
export function findStandaloneDirectives(markdown, name) {
  const pattern = new RegExp(`^\\s*<!--\\s*${name}\\s*:\\s*(.*?)\\s*-->\\s*$`, 'u');
  const found = [];
  let fence = null;
  let inComment = false;
  String(markdown ?? '').split(/\r?\n/u).forEach((line, lineIndex) => {
    if (fence) {
      if (isFenceClose(line, fence)) fence = null;
      return;
    }
    if (!inComment) {
      fence = parseFenceStart(line);
      if (fence) return;
      const match = line.match(pattern);
      if (match) {
        found.push({ lineIndex, value: match[1].trim() });
        return;
      }
    }
    let cursor = 0;
    while (cursor < line.length) {
      const position = line.indexOf(inComment ? '-->' : '<!--', cursor);
      if (position === -1) break;
      cursor = position + (inComment ? 3 : 4);
      inComment = !inComment;
    }
  });
  return found;
}
