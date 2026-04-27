import { isFenceClose, isHorizontalRule, parseFenceStart } from './markdown.mjs';
import { splitLinesPreservingEOF } from './text-lines.mjs';

function updateHtmlCommentState(line, inHtmlComment) {
  const source = String(line ?? '');
  let cursor = 0;
  let state = inHtmlComment;

  while (cursor < source.length) {
    if (state) {
      const end = source.indexOf('-->', cursor);
      if (end === -1) return true;
      cursor = end + 3;
      state = false;
      continue;
    }

    const start = source.indexOf('<!--', cursor);
    if (start === -1) return false;

    const end = source.indexOf('-->', start + 4);
    if (end === -1) return true;

    cursor = end + 3;
  }

  return state;
}

function cleanHeadingText(rawText) {
  return String(rawText ?? '')
    .replace(/\s+#+\s*$/u, '')
    .trim();
}

export function parseMarkdownHeadings(markdown) {
  const { lines } = splitLinesPreservingEOF(markdown);
  const headings = [];
  let fence = null;
  let inHtmlComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!fence) {
      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
        continue;
      }

      if (!inHtmlComment) {
        const match = String(line).match(/^(#{1,6})[ \t]+(.+?)\s*$/u);
        if (match) {
          headings.push({
            level: match[1].length,
            lineIndex: index,
            rawText: match[2],
            text: cleanHeadingText(match[2]),
          });
        }
      }
    } else if (isFenceClose(line, fence)) {
      fence = null;
    }

    inHtmlComment = updateHtmlCommentState(line, inHtmlComment);
  }

  return headings;
}

export function findSlideStartLineIndexes(markdown) {
  const { lines } = splitLinesPreservingEOF(markdown);
  const slideStarts = new Set([0]);
  let fence = null;
  let inHtmlComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!fence) {
      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
      } else if (!inHtmlComment && isHorizontalRule(line)) {
        slideStarts.add(index + 1);
      }
    } else if (isFenceClose(line, fence)) {
      fence = null;
    }

    inHtmlComment = updateHtmlCommentState(line, inHtmlComment);
  }

  return slideStarts;
}
