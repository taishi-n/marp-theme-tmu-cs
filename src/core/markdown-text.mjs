import { isFenceClose, parseFenceStart } from './markdown.mjs';

function findUnescaped(value, needle, startIndex) {
  let index = startIndex;

  while (index < value.length) {
    const found = value.indexOf(needle, index);
    if (found === -1) return -1;

    let backslashes = 0;
    for (let cursor = found - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) backslashes += 1;
    if (backslashes % 2 === 0) return found;
    index = found + needle.length;
  }

  return -1;
}

function findBalancedClose(value, startIndex, openCharacter, closeCharacter) {
  let depth = 1;

  for (let index = startIndex; index < value.length; index += 1) {
    if (value[index] === '\\') {
      index += 1;
      continue;
    }
    if (value[index] === openCharacter) depth += 1;
    if (value[index] !== closeCharacter) continue;
    depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

function findLinkEnd(line, startIndex) {
  const labelStart = line[startIndex] === '!' ? startIndex + 1 : startIndex;
  if (line[labelStart] !== '[') return -1;

  const labelEnd = findUnescaped(line, ']', labelStart + 1);
  if (labelEnd === -1) return -1;

  let cursor = labelEnd + 1;
  while (cursor < line.length && /[ \t]/u.test(line[cursor])) cursor += 1;

  if (line[cursor] === '(') {
    const close = findBalancedClose(line, cursor + 1, '(', ')');
    return close === -1 ? -1 : close + 1;
  }

  if (line[cursor] === '[') {
    const close = findUnescaped(line, ']', cursor + 1);
    return close === -1 ? -1 : close + 1;
  }

  return -1;
}

function transformInlineText(line, transform, state, lineOffset) {
  let output = '';
  let textStart = 0;
  let cursor = 0;

  const appendText = (end) => {
    if (end <= textStart) return;
    output += transform(line.slice(textStart, end), { offset: lineOffset + textStart });
  };

  const appendProtected = (end) => {
    appendText(cursor);
    output += line.slice(cursor, end);
    cursor = end;
    textStart = end;
  };

  while (cursor < line.length) {
    if (state.inHtmlComment) {
      const commentEnd = line.indexOf('-->', cursor);
      if (commentEnd === -1) {
        appendProtected(line.length);
        return output;
      }
      appendProtected(commentEnd + 3);
      state.inHtmlComment = false;
      continue;
    }

    if (line.startsWith('<!--', cursor)) {
      const commentEnd = line.indexOf('-->', cursor + 4);
      if (commentEnd === -1) {
        appendProtected(line.length);
        state.inHtmlComment = true;
        return output;
      }
      appendProtected(commentEnd + 3);
      continue;
    }

    if (line[cursor] === '`') {
      let runEnd = cursor + 1;
      while (line[runEnd] === '`') runEnd += 1;
      const delimiter = line.slice(cursor, runEnd);
      const close = line.indexOf(delimiter, runEnd);
      if (close !== -1) {
        appendProtected(close + delimiter.length);
        continue;
      }
    }

    if (line[cursor] === '<') {
      const tagEnd = line.indexOf('>', cursor + 1);
      if (tagEnd !== -1) {
        appendProtected(tagEnd + 1);
        continue;
      }
    }

    if (line[cursor] === '!' && line[cursor + 1] === '[') {
      const linkEnd = findLinkEnd(line, cursor);
      if (linkEnd !== -1) {
        appendProtected(linkEnd);
        continue;
      }
    }

    if (line[cursor] === '[') {
      const linkEnd = findLinkEnd(line, cursor);
      if (linkEnd !== -1) {
        appendProtected(linkEnd);
        continue;
      }
    }

    if (line[cursor] === '\\' && cursor + 1 < line.length) {
      appendProtected(cursor + 2);
      continue;
    }

    cursor += 1;
  }

  appendText(line.length);
  return output;
}

export function transformMarkdownText(markdown, transform) {
  const source = String(markdown ?? '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const state = { inHtmlComment: false };
  let fence = null;
  let offset = 0;

  return lines.map((line) => {
    let result;

    if (fence) {
      result = line;
      if (isFenceClose(line, fence)) fence = null;
    } else {
      const fenceStart = parseFenceStart(line);
      if (fenceStart && !state.inHtmlComment) {
        fence = fenceStart;
        result = line;
      } else {
        result = transformInlineText(line, transform, state, offset);
      }
    }

    offset += line.length + 1;
    return result;
  }).join('\n');
}

export function markdownTextMatches(markdown, pattern) {
  let matches = false;
  transformMarkdownText(markdown, (text) => {
    pattern.lastIndex = 0;
    if (pattern.test(text)) matches = true;
    return text;
  });
  return matches;
}
