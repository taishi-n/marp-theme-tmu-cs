import { joinLines, splitLinesPreservingEOF } from '../../core/text-lines.mjs';

const citationPlaceholderPattern = /\[((?:\\.|[^\]\\])*)\]\{([^}]*)\}/g;
const pandocRefsStartPattern = /^(:{3,})\s+\{#refs\b/;
const pandocHeadingAttributePattern = /^(#{1,6}\s+.*?)(?:\s+\{[.#][^}]+\})\s*$/;
const referenceHeadingPattern = /^(#{1,6})\s+(references?|bibliography|works cited|参考文献)\s*$/iu;

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

function updateHtmlCommentState(line, inHtmlComment) {
  const source = String(line ?? '');
  let index = 0;
  let state = inHtmlComment;

  while (index < source.length) {
    if (!state) {
      const openIndex = source.indexOf('<!--', index);
      if (openIndex === -1) break;
      state = true;
      index = openIndex + 4;
      continue;
    }

    const closeIndex = source.indexOf('-->', index);
    if (closeIndex === -1) break;
    state = false;
    index = closeIndex + 3;
  }

  return state;
}

function encodeFootnoteId(id) {
  return encodeURIComponent(String(id ?? ''));
}

function decodeFootnoteId(id) {
  return decodeURIComponent(String(id ?? ''));
}

function normalizeProtectedFootnoteId(id) {
  return String(id ?? '').replace(/\\_/gu, '_');
}

function normalizeCitationText(text) {
  return String(text ?? '')
    .replace(/\\([[\]{}()])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function containsCitationSyntax(markdown) {
  return /\[@[^\]]+\]/u.test(String(markdown ?? ''));
}

export function normalizeBibliographyReferences(frontMatter = {}) {
  if (typeof frontMatter.bibliography === 'string') {
    return frontMatter.bibliography.trim() === '' ? [] : [frontMatter.bibliography.trim()];
  }

  if (Array.isArray(frontMatter.bibliography)) {
    return frontMatter.bibliography
      .filter((value) => typeof value === 'string' && value.trim() !== '')
      .map((value) => value.trim());
  }

  return [];
}

export function hasBibliography(frontMatter = {}) {
  return normalizeBibliographyReferences(frontMatter).length > 0;
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function stripPandocHeadingAttributes(markdown) {
  const { lines } = splitLinesPreservingEOF(markdown);
  const normalizedLines = [];
  let fence = null;

  for (const line of lines) {
    if (!fence) {
      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
        normalizedLines.push(line);
        continue;
      }

      normalizedLines.push(line.replace(pandocHeadingAttributePattern, '$1'));
      continue;
    }

    normalizedLines.push(line);
    if (isFenceClose(line, fence)) fence = null;
  }

  return normalizedLines.join('\n');
}

export function normalizeDisplayMathBlocks(markdown) {
  const { lines } = splitLinesPreservingEOF(markdown);
  const normalizedLines = [];
  let fence = null;

  for (const line of lines) {
    if (!fence) {
      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
        normalizedLines.push(line);
        continue;
      }

      const singleLineDisplayMath = line.match(/^(\s*)\$\$(.+)\$\$(\s*)$/u);
      if (singleLineDisplayMath) {
        normalizedLines.push(`${singleLineDisplayMath[1]}$$`);
        normalizedLines.push(`${singleLineDisplayMath[1]}${singleLineDisplayMath[2].trim()}`);
        normalizedLines.push(`${singleLineDisplayMath[1]}$$${singleLineDisplayMath[3]}`);
        continue;
      }

      const openingDisplayMath = line.match(/^(\s*)\$\$(.+)$/u);
      if (openingDisplayMath) {
        normalizedLines.push(`${openingDisplayMath[1]}$$`);
        normalizedLines.push(`${openingDisplayMath[1]}${openingDisplayMath[2]}`);
        continue;
      }

      const closingDisplayMath = line.match(/^(.*\S)\$\$(\s*)$/u);
      if (closingDisplayMath) {
        normalizedLines.push(closingDisplayMath[1]);
        normalizedLines.push(`$$${closingDisplayMath[2]}`);
        continue;
      }

      normalizedLines.push(line);
      continue;
    }

    normalizedLines.push(line);
    if (isFenceClose(line, fence)) fence = null;
  }

  return normalizedLines.join('\n');
}

export function stripPandocRefsBlock(markdown) {
  const { lines } = splitLinesPreservingEOF(markdown);
  const output = [];
  let refsFenceLength = null;
  let hadRefsBlock = false;

  for (const line of lines) {
    if (refsFenceLength === null) {
      const match = line.match(pandocRefsStartPattern);

      if (match) {
        refsFenceLength = match[1].length;
        hadRefsBlock = true;
        continue;
      }

      output.push(line);
      continue;
    }

    if (new RegExp(`^:{${refsFenceLength},}\\s*$`, 'u').test(line)) {
      refsFenceLength = null;
    }
  }

  return {
    content: output.join('\n').replace(/\n{3,}$/u, '\n\n'),
    hadRefsBlock,
  };
}

export function appendBlock(content, block) {
  const base = String(content ?? '').replace(/\s+$/u, '');
  if (!block) return base;
  if (base === '') return block;
  return `${base}\n\n${block}`;
}

export function renderCitationListBlock(entries, markerClass, labelClass) {
  if (entries.length === 0) return '';

  const items = entries.map((entry) => {
    const label = entry.label ? `<span class="${labelClass}">${escapeHtml(entry.label)}</span> ` : '';
    return `- ${label}${entry.bodyHtml}`;
  }).join('\n');

  return `<div class="${markerClass}" aria-hidden="true"></div>\n\n${items}`;
}

export function replaceCitationPlaceholders(markdown, bibliographyEntries, onWarning) {
  const citedKeys = [];
  const seenKeys = new Set();

  const content = markdown.replace(citationPlaceholderPattern, (match, text, rawAttributes) => {
    if (!/\.citation-placeholder\b/u.test(rawAttributes)) return match;

    const keyMatch = rawAttributes.match(/\bdata-cite-keys="([^"]+)"/u);
    if (!keyMatch) return match;

    const keys = keyMatch[1]
      .split(/\s*;\s*/u)
      .map((key) => key.trim())
      .filter(Boolean);

    for (const key of keys) {
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      citedKeys.push(key);

      if (!bibliographyEntries.has(key)) {
        onWarning?.(`citation "${key}" was rendered, but no bibliography entry was found for the slide footnotes.`);
      }
    }

    const citationText = normalizeCitationText(text);
    return `<span class="citation-ref" data-cite-keys="${escapeHtml(keyMatch[1])}">${escapeHtml(citationText)}</span>`;
  });

  return {
    content,
    citedKeys,
  };
}

export function extractMarkdownFootnotes(markdown) {
  const { lines } = splitLinesPreservingEOF(markdown);
  const remainingLines = [];
  const definitions = new Map();
  let fence = null;
  let inHtmlComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!fence) {
      if (inHtmlComment) {
        remainingLines.push(line);
        inHtmlComment = updateHtmlCommentState(line, inHtmlComment);
        continue;
      }

      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
        remainingLines.push(line);
        continue;
      }

      const nextHtmlCommentState = updateHtmlCommentState(line, inHtmlComment);
      if (nextHtmlCommentState) {
        remainingLines.push(line);
        inHtmlComment = nextHtmlCommentState;
        continue;
      }

      const definitionMatch = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/u)
        ?? line.match(/^TMUCS_FOOTNOTE_LABEL(?:\\_\\_|__)(.+?)(?:\\_\\_|__):(\s*.*)$/u);
      if (definitionMatch) {
        const id = definitionMatch[0].startsWith('TMUCS_FOOTNOTE_LABEL')
          ? decodeFootnoteId(normalizeProtectedFootnoteId(definitionMatch[1].trim()))
          : definitionMatch[1].trim();
        const bodyLines = [definitionMatch[2]];

        while (index + 1 < lines.length) {
          const nextLine = lines[index + 1];
          if (/^(?: {2,}|\t+)\S/u.test(nextLine)) {
            bodyLines.push(nextLine.replace(/^(?: {2,}|\t+)/u, ''));
            index += 1;
            continue;
          }
          if (nextLine.trim() === '') {
            index += 1;
            break;
          }
          break;
        }

        definitions.set(id, bodyLines.join(' ').trim());
        continue;
      }

      remainingLines.push(line);
      continue;
    }

    remainingLines.push(line);
    if (isFenceClose(line, fence)) fence = null;
  }

  return {
    content: remainingLines.join('\n').replace(/\n{3,}$/u, '\n\n'),
    definitions,
  };
}

export function replaceMarkdownFootnoteReferences(markdown, definitions, onWarning) {
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(markdown);
  const citedIds = [];
  const seenIds = new Set();
  let fence = null;
  let inHtmlComment = false;

  const content = joinLines(lines.map((line) => {
    if (!fence) {
      if (inHtmlComment) {
        inHtmlComment = updateHtmlCommentState(line, inHtmlComment);
        return line;
      }

      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
        return line;
      }

      const nextHtmlCommentState = updateHtmlCommentState(line, inHtmlComment);
      if (nextHtmlCommentState) {
        inHtmlComment = nextHtmlCommentState;
        return line;
      }

      return line.replace(/\[\^([^\]]+)\]|TMUCS_FOOTNOTE_REF(?:\\_\\_|__)(.+?)(?:\\_\\_|__)/gu, (match, bracketId, placeholderId) => {
        const id = typeof bracketId === 'string' && bracketId !== ''
          ? bracketId.trim()
          : decodeFootnoteId(normalizeProtectedFootnoteId(String(placeholderId).trim()));
        if (!seenIds.has(id)) {
          seenIds.add(id);
          citedIds.push(id);
          if (!definitions.has(id)) {
            onWarning?.(`footnote "${id}" was referenced, but no definition was found in the slide.`);
          }
        }

        const number = citedIds.indexOf(id) + 1;
        return `<sup class="footnote-ref">[${number}]</sup>`;
      });
    }

    if (isFenceClose(line, fence)) fence = null;
    return line;
  }), hasTrailingNewline);

  const footnotes = citedIds
    .filter((id) => definitions.has(id))
    .map((id, index) => ({
      label: `[${index + 1}]`,
      bodyHtml: escapeHtml(definitions.get(id)),
    }));

  return {
    content,
    footnotes,
  };
}

export function protectMarkdownFootnotes(markdown) {
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(markdown);
  let fence = null;
  let inHtmlComment = false;

  return joinLines(lines.map((line) => {
    if (!fence) {
      if (inHtmlComment) {
        inHtmlComment = updateHtmlCommentState(line, inHtmlComment);
        return line;
      }

      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
        return line;
      }

      const nextHtmlCommentState = updateHtmlCommentState(line, inHtmlComment);
      if (nextHtmlCommentState) {
        inHtmlComment = nextHtmlCommentState;
        return line;
      }

      const definitionMatch = line.match(/^\[\^([^\]]+)\]:(\s*.*)$/u);
      if (definitionMatch) {
        return `TMUCS_FOOTNOTE_LABEL__${encodeFootnoteId(definitionMatch[1].trim())}__:${definitionMatch[2]}`;
      }

      return line.replace(/\[\^([^\]]+)\]/gu, (match, rawId) => (
        `TMUCS_FOOTNOTE_REF__${encodeFootnoteId(String(rawId).trim())}__`
      ));
    }

    if (isFenceClose(line, fence)) fence = null;
    return line;
  }), hasTrailingNewline);
}

export function restoreProtectedMarkdownFootnotes(markdown) {
  return String(markdown ?? '')
    .replace(/TMUCS_FOOTNOTE_LABEL(?:\\_\\_|__)(.+?)(?:\\_\\_|__):/gu, (match, encodedId) => (
      `[^${decodeFootnoteId(normalizeProtectedFootnoteId(encodedId))}]:`
    ))
    .replace(/TMUCS_FOOTNOTE_REF(?:\\_\\_|__)(.+?)(?:\\_\\_|__)/gu, (match, encodedId) => (
      `[^${decodeFootnoteId(normalizeProtectedFootnoteId(encodedId))}]`
    ));
}

export function slideHasReferenceHeading(markdown) {
  return String(markdown ?? '')
    .split('\n')
    .some((line) => referenceHeadingPattern.test(line.trim()));
}

export function restorePandocRawHtml(markdown) {
  return String(markdown ?? '').replace(/`(<\/?[A-Za-z][^`]*)`\{=html\}/gu, '$1');
}

export function restorePandocFencedDivs(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const restored = [];
  let fence = null;
  const divStack = [];

  for (const line of lines) {
    if (!fence) {
      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
        restored.push(line);
        continue;
      }

      const openMatch = line.match(/^(\s*)(:{3,})\s+([A-Za-z][\w-]*)\s*$/);
      if (openMatch) {
        restored.push(`${openMatch[1]}<div class="${openMatch[3]}">`);
        divStack.push(openMatch[3]);
        continue;
      }

      const closeMatch = line.match(/^(\s*)(:{3,})\s*$/);
      if (closeMatch && divStack.length > 0) {
        restored.push(`${closeMatch[1]}</div>`);
        divStack.pop();
        continue;
      }

      restored.push(line);
      continue;
    }

    restored.push(line);
    if (isFenceClose(line, fence)) fence = null;
  }

  return restored.join('\n');
}
