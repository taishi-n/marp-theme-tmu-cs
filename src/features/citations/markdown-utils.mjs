import { escapeHtml } from '../../core/html.mjs';
import { stripSlideSource } from '../../core/slide-source.mjs';
import { isFenceClose, parseFenceStart } from '../../core/markdown.mjs';
import { splitLinesPreservingEOF } from '../../core/text-lines.mjs';
import { markdownTextMatches, transformMarkdownText } from '../../core/markdown-text.mjs';

export { escapeHtml };

const referencePlaceholderPattern = /^(:{3,})\s+\{#refs\b/;
const referenceHeadingTextPattern = /^(references?|bibliography|works cited|参考文献)$/iu;
export const referenceHeadingPattern = /^(#{1,6})\s+(references?|bibliography|works cited|参考文献)\s*$/iu;

export function isReferenceHeadingText(value) {
  return referenceHeadingTextPattern.test(String(value ?? '').trim());
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

export function containsCitationSyntax(markdown) {
  return collectInlineReferenceOrder(markdown).some((reference) => reference.type === 'citation');
}

export function containsMarkdownFootnoteSyntax(markdown) {
  return markdownTextMatches(markdown, /\[\^[^\]]+\]/u);
}

export function collectInlineReferenceOrder(markdown) {
  const references = [];
  const seen = new Set();

  transformMarkdownText(markdown, (text, context) => {
    const pattern = /\[\^([^\]]+)\](?!:)|\[((?:\\.|[^\]\\])*)\]/gu;

    for (const match of text.matchAll(pattern)) {
      if (match[1] !== undefined) {
        const id = match[1].trim();
        const identity = `footnote:${id}`;
        if (id !== '' && !seen.has(identity)) {
          seen.add(identity);
          references.push({ id, offset: context.offset + match.index, type: 'footnote' });
        }
        continue;
      }

      for (const citation of match[2].matchAll(/(?<![A-Za-z0-9_])-?@([A-Za-z0-9_:.#$%&+?/<>-]+)/gu)) {
        const key = citation[1].trim();
        const identity = `citation:${key}`;
        if (key !== '' && !seen.has(identity)) {
          seen.add(identity);
          references.push({ key, offset: context.offset + match.index, type: 'citation' });
        }
      }
    }

    return text;
  });

  return references.sort((left, right) => left.offset - right.offset);
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

export function stripReferenceListPlaceholder(markdown) {
  const { lines } = splitLinesPreservingEOF(markdown);
  const output = [];
  let refsFenceLength = null;
  let hadRefsBlock = false;
  let fence = null;

  for (const line of lines) {
    if (!fence) {
      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
        output.push(line);
        continue;
      }
    } else {
      output.push(line);
      if (isFenceClose(line, fence)) fence = null;
      continue;
    }

    if (refsFenceLength === null) {
      const match = line.match(referencePlaceholderPattern);

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

export function renderCitationOrderedListBlock(entries, listClass, itemClass) {
  if (entries.length === 0) return '';

  const items = entries.map((entry) => `<li class="${itemClass}">${entry.bodyHtml}</li>`).join('\n');

  return `<ol class="${listClass}">\n${items}\n</ol>`;
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

      const definitionMatch = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/u);
      if (definitionMatch) {
        const id = definitionMatch[1].trim();
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

export function replaceMarkdownFootnoteReferences(markdown, definitions, onWarning, numberById = new Map()) {
  const citedIds = [];
  const seenIds = new Set();
  const content = transformMarkdownText(markdown, (text) => (
    text.replace(/\[\^([^\]]+)\]/gu, (_match, rawId) => {
        const id = String(rawId).trim();
        if (!seenIds.has(id)) {
          seenIds.add(id);
          citedIds.push(id);
          if (!definitions.has(id)) {
            onWarning?.(`footnote "${id}" was referenced, but no definition was found in the slide.`);
          }
        }

        const number = numberById.get(id) ?? (citedIds.indexOf(id) + 1);
        return `<sup class="footnote-ref">[${number}]</sup>`;
      })
  ));

  const footnotes = citedIds
    .filter((id) => definitions.has(id))
    .map((id, index) => ({
      id,
      label: `[${numberById.get(id) ?? (index + 1)}]`,
      bodyHtml: definitions.get(id),
    }));

  return {
    content,
    footnotes,
  };
}

export function slideHasReferenceHeading(markdown) {
  return String(markdown ?? '')
    .split('\n')
    .some((line) => referenceHeadingPattern.test(line.trim()));
}

export function slideIsReferenceHeadingOnly(markdown) {
  const stripped = stripSlideSource(markdown)
    .split('\n')
    .filter((line) => !referenceHeadingPattern.test(line.trim()))
    .join('\n')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .trim();

  return stripped === '' && slideHasReferenceHeading(markdown);
}
