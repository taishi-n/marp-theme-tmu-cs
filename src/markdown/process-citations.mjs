import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, delimiter, resolve } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const citationPlaceholderPattern = /\[((?:\\.|[^\]\\])*)\]\{([^}]*)\}/g;
const pandocRefsStartPattern = /^(:{3,})\s+\{#refs\b/;
const pandocHeadingAttributePattern = /^(#{1,6}\s+.*?)(?:\s+\{[.#][^}]+\})\s*$/;
const referenceHeadingPattern = /^(#{1,6})\s+(references?|bibliography|works cited|参考文献)\s*$/iu;
const xhtmlNamespacePattern = /\s+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/gu;
const serializer = new XMLSerializer();
const domParser = new DOMParser({
  onError: () => {},
});

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function normalizeBibliographyReferences(frontMatter = {}) {
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

function hasBibliography(frontMatter = {}) {
  return normalizeBibliographyReferences(frontMatter).length > 0;
}

function containsCitationSyntax(markdown) {
  return /\[@[^\]]+\]/u.test(String(markdown ?? ''));
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

function splitLinesPreservingEOF(source) {
  const normalized = String(source ?? '').replace(/\r\n/g, '\n');
  const hasTrailingNewline = normalized.endsWith('\n');
  const body = hasTrailingNewline ? normalized.slice(0, -1) : normalized;

  return {
    lines: body === '' ? [''] : body.split('\n'),
    hasTrailingNewline,
  };
}

function joinLines(lines, hasTrailingNewline) {
  const joined = lines.join('\n');
  return hasTrailingNewline ? `${joined}\n` : joined;
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

function splitSlides(markdown) {
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

function joinSlides({ frontMatter, slides, hasTrailingNewline }) {
  const parts = [];
  const normalizedSlides = slides.length > 0 ? slides : [''];

  if (frontMatter !== '') parts.push(frontMatter);
  parts.push(normalizedSlides.join('\n\n---\n\n'));

  const joined = parts.filter((part, index) => index === 0 || part !== '').join('\n\n');
  return hasTrailingNewline ? `${joined}\n` : joined;
}

function normalizeCitationText(text) {
  return String(text ?? '')
    .replace(/\\([[\]{}()])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function serializeNodes(nodes) {
  return nodes
    .map((node) => serializer.serializeToString(node))
    .join('')
    .replace(xhtmlNamespacePattern, '');
}

function normalizeDoi(value) {
  const normalized = asNonEmptyString(value);
  if (!normalized) return undefined;

  return normalized
    .replace(/^doi:\s*/iu, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
    .trim() || undefined;
}

function normalizeUrl(value) {
  const normalized = asNonEmptyString(value);
  if (!normalized) return undefined;

  try {
    return new URL(normalized).href;
  } catch {
    return undefined;
  }
}

function normalizeExistingLink(value) {
  const normalizedUrl = normalizeUrl(value);
  if (normalizedUrl) return normalizedUrl;

  const normalizedDoi = normalizeDoi(value);
  return normalizedDoi ? `https://doi.org/${normalizedDoi}` : undefined;
}

function collectExistingLinkHrefs(bodyHtml) {
  const document = domParser.parseFromString(`<html><body><div id="fragment">${bodyHtml}</div></body></html>`, 'text/html');
  const container = document.getElementById('fragment');
  const hrefs = new Set();

  if (!container) return hrefs;

  for (const link of Array.from(container.getElementsByTagName('a'))) {
    const href = normalizeExistingLink(link.getAttribute('href'));
    if (href) hrefs.add(href);
  }

  return hrefs;
}

function appendSupplementalBibliographyLinks(bodyHtml, linkMetadata) {
  if (!linkMetadata) return bodyHtml;

  const existingLinks = collectExistingLinkHrefs(bodyHtml);
  const missingLinks = [];

  if (linkMetadata.doiUrl && !existingLinks.has(linkMetadata.doiUrl)) {
    missingLinks.push({ href: linkMetadata.doiUrl, label: 'DOI' });
  }

  if (linkMetadata.url && !existingLinks.has(linkMetadata.url) && linkMetadata.url !== linkMetadata.doiUrl) {
    missingLinks.push({ href: linkMetadata.url, label: 'URL' });
  }

  if (missingLinks.length === 0) return bodyHtml;

  const linksHtml = missingLinks
    .map((link) => `[<a href="${escapeHtml(link.href)}">${link.label}</a>]`)
    .join(' ');

  return `${bodyHtml} <span class="citation-links">${linksHtml}</span>`;
}

function hasClass(node, className) {
  const classAttr = typeof node?.getAttribute === 'function' ? node.getAttribute('class') : '';
  return typeof classAttr === 'string' && classAttr.split(/\s+/u).includes(className);
}

function findFirstDescendantByClass(root, className) {
  if (!root?.childNodes) return undefined;

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType !== 1) continue;
    if (hasClass(child, className)) return child;

    const nested = findFirstDescendantByClass(child, className);
    if (nested) return nested;
  }

  return undefined;
}

function normalizeBibliographyBodyHtml(html) {
  return String(html ?? '')
    .trim()
    .replace(/^<p>([\s\S]*)<\/p>$/iu, '$1')
    .replace(/<(\/?)div\b/giu, '<$1span')
    .replace(/\s+/gu, ' ')
    .trim();
}

function parseBibliographyEntries(html, linkMetadataByKey = new Map()) {
  const wrappedHtml = `<html><body>${String(html ?? '')}</body></html>`;
  const document = domParser.parseFromString(wrappedHtml, 'text/html');
  const refs = document.getElementById('refs');

  if (!refs) {
    return {
      entries: [],
      entriesByKey: new Map(),
    };
  }

  const entries = [];

  for (const node of Array.from(refs.childNodes)) {
    if (node.nodeType !== 1) continue;

    const id = typeof node.getAttribute === 'function' ? node.getAttribute('id') : '';
    if (!id?.startsWith('ref-')) continue;

    const key = id.slice(4);
    const labelNode = findFirstDescendantByClass(node, 'csl-left-margin');
    const bodyNode = findFirstDescendantByClass(node, 'csl-right-inline')
      ?? findFirstDescendantByClass(node, 'csl-indent');
    const label = asNonEmptyString(labelNode?.textContent?.replace(/\s+/gu, ' '));
    const bodyHtml = appendSupplementalBibliographyLinks(
      normalizeBibliographyBodyHtml(
        bodyNode
          ? serializeNodes(Array.from(bodyNode.childNodes))
          : serializeNodes(
            Array.from(node.childNodes).filter(
              (child) => child.nodeType !== 1 || !hasClass(child, 'csl-left-margin'),
            ),
          ),
      ),
      linkMetadataByKey.get(key),
    );

    entries.push({
      key,
      label,
      bodyHtml,
    });
  }

  return {
    entries,
    entriesByKey: new Map(entries.map((entry) => [entry.key, entry])),
  };
}

function parseBibliographyLinkMetadata(jsonText) {
  let parsed;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to parse bibliography metadata emitted by pandoc. ${message}`);
  }

  const entries = Array.isArray(parsed) ? parsed : [];
  const metadataByKey = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    const key = asNonEmptyString(entry.id);
    if (!key) continue;

    const doi = normalizeDoi(entry.DOI ?? entry.doi);
    const url = normalizeUrl(entry.URL ?? entry.url);

    if (!doi && !url) continue;

    metadataByKey.set(key, {
      doi,
      doiUrl: doi ? `https://doi.org/${doi}` : undefined,
      url,
    });
  }

  return metadataByKey;
}

function stripPandocHeadingAttributes(markdown) {
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

function normalizeDisplayMathBlocks(markdown) {
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

function stripPandocRefsBlock(markdown) {
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

function appendBlock(content, block) {
  const base = String(content ?? '').replace(/\s+$/u, '');
  if (!block) return base;
  if (base === '') return block;
  return `${base}\n\n${block}`;
}

function renderCitationListBlock(entries, markerClass, labelClass) {
  if (entries.length === 0) return '';

  const items = entries.map((entry) => {
    const label = entry.label ? `<span class="${labelClass}">${escapeHtml(entry.label)}</span> ` : '';
    return `- ${label}${entry.bodyHtml}`;
  }).join('\n');

  return `<div class="${markerClass}" aria-hidden="true"></div>\n\n${items}`;
}

function replaceCitationPlaceholders(markdown, bibliographyEntries, onWarning) {
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

function extractMarkdownFootnotes(markdown) {
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

function replaceMarkdownFootnoteReferences(markdown, definitions, onWarning) {
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

function protectMarkdownFootnotes(markdown) {
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

function restoreProtectedMarkdownFootnotes(markdown) {
  return String(markdown ?? '')
    .replace(/TMUCS_FOOTNOTE_LABEL(?:\\_\\_|__)(.+?)(?:\\_\\_|__):/gu, (match, encodedId) => (
      `[^${decodeFootnoteId(normalizeProtectedFootnoteId(encodedId))}]:`
    ))
    .replace(/TMUCS_FOOTNOTE_REF(?:\\_\\_|__)(.+?)(?:\\_\\_|__)/gu, (match, encodedId) => (
      `[^${decodeFootnoteId(normalizeProtectedFootnoteId(encodedId))}]`
    ));
}

function slideHasReferenceHeading(markdown) {
  return String(markdown ?? '')
    .split('\n')
    .some((line) => referenceHeadingPattern.test(line.trim()));
}

function isEffectivelyEmpty(markdown) {
  return String(markdown ?? '').trim() === '';
}

function restorePandocRawHtml(markdown) {
  return String(markdown ?? '').replace(/`(<\/?[A-Za-z][^`]*)`\{=html\}/gu, '$1');
}

function restorePandocFencedDivs(markdown) {
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

function reportPandocMessages(stderr, onWarning) {
  const message = String(stderr ?? '').trim();
  if (message === '') return;

  for (const line of message.split(/\r?\n/u)) {
    const trimmedLine = line.trim();
    if (trimmedLine !== '') onWarning?.(trimmedLine);
  }
}

function runPandoc(args, options = {}) {
  const result = spawnSync('pandoc', args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  reportPandocMessages(result.stderr, options.onWarning);

  if (result.error) {
    throw new Error(`failed to start pandoc. ${result.error.message}`);
  }

  if (result.status !== 0) {
    const detail = String(result.stderr ?? '').trim() || `pandoc exited with status ${result.status}.`;
    throw new Error(detail);
  }

  return result.stdout;
}

export default function processCitations(markdown, options = {}) {
  const frontMatter = options.frontMatter ?? {};
  const markdownPath = asNonEmptyString(options.markdownPath)
    ? resolve(options.markdownPath)
    : undefined;

  if (!hasBibliography(frontMatter)) {
    if (containsCitationSyntax(markdown)) {
      throw new Error(`[tmu-cs] citation syntax was detected, but YAML front matter does not define bibliography:.`);
    }

    return markdown;
  }

  const defaultCslPath = resolve(options.defaultCslPath ?? '');
  const pandocCiteFilterPath = resolve(options.pandocCiteFilterPath ?? '');
  const fallbackMarkdownDir = process.cwd();
  const markdownDir = markdownPath ? dirname(markdownPath) : fallbackMarkdownDir;
  const bibliographyReferences = normalizeBibliographyReferences(frontMatter);
  const bibliographyPaths = bibliographyReferences.map((reference) => resolve(markdownDir, reference));
  const tempDirectory = mkdtempSync(resolve(tmpdir(), 'tmu-cs-citeproc-'));
  const pandocInputPath = resolve(tempDirectory, markdownPath ? 'slides-protected.md' : 'slides.md');
  const resourcePath = [markdownDir, dirname(defaultCslPath)].join(delimiter);
  const commonArgs = [
    '--from', 'markdown',
    '--resource-path', resourcePath,
    '--citeproc',
    '--lua-filter', pandocCiteFilterPath,
  ];

  if (!asNonEmptyString(frontMatter.csl)) {
    commonArgs.push('--csl', defaultCslPath);
  }

  const onWarning = (message) => {
    options.onWarning?.({
      message,
    });
  };

  writeFileSync(pandocInputPath, protectMarkdownFootnotes(markdown), 'utf8');

  let citeprocMarkdown;
  let bibliographyHtml;
  let bibliographyLinkMetadata;

  try {
    citeprocMarkdown = runPandoc(
      [
        '--standalone',
        '--to', 'markdown',
        '--wrap=preserve',
        ...commonArgs,
        pandocInputPath,
      ],
      {
        cwd: markdownDir,
        onWarning,
      },
    );

    bibliographyHtml = runPandoc(
      [
        '--to', 'html',
        '--wrap=none',
        ...commonArgs,
        pandocInputPath,
      ],
      {
        cwd: markdownDir,
        onWarning,
      },
    );

    bibliographyLinkMetadata = parseBibliographyLinkMetadata(
      runPandoc(
        [
          '--from', 'bibtex',
          '--to', 'csljson',
          ...bibliographyPaths,
        ],
        {
          cwd: markdownDir,
          onWarning,
        },
      ),
    );
  } finally {
    if (tempDirectory) rmSync(tempDirectory, { force: true, recursive: true });
  }

  const normalizedMarkdown = restorePandocFencedDivs(
    restoreProtectedMarkdownFootnotes(
      restorePandocRawHtml(normalizeDisplayMathBlocks(citeprocMarkdown)),
    ),
  );
  const { entries, entriesByKey } = parseBibliographyEntries(bibliographyHtml, bibliographyLinkMetadata);
  const { frontMatter: rawFrontMatter, slides, hasTrailingNewline } = splitSlides(normalizedMarkdown);
  const transformedSlides = [];
  const bibliographyBlock = renderCitationListBlock(entries, 'citation-bibliography-marker', 'citation-bibliography-label');
  let referencesInserted = false;
  let referencesWereRequested = false;

  for (const slide of slides) {
    const strippedHeadingAttributes = stripPandocHeadingAttributes(slide);
    const { content: slideWithoutRefs, hadRefsBlock } = stripPandocRefsBlock(strippedHeadingAttributes);
    const { content: slideWithoutMarkdownFootnoteDefs, definitions: markdownFootnoteDefinitions } = extractMarkdownFootnotes(slideWithoutRefs);
    const { content: slideWithMarkdownFootnotes, footnotes: markdownFootnotes } = replaceMarkdownFootnoteReferences(
      slideWithoutMarkdownFootnoteDefs,
      markdownFootnoteDefinitions,
      onWarning,
    );
    const { content: slideWithInlineCitations, citedKeys } = replaceCitationPlaceholders(slideWithMarkdownFootnotes, entriesByKey, onWarning);
    const slideFootnotes = citedKeys
      .map((key) => entriesByKey.get(key))
      .filter(Boolean);

    let content = slideWithInlineCitations;

    if (slideFootnotes.length > 0) {
      content = appendBlock(
        content,
        renderCitationListBlock(slideFootnotes, 'citation-footnotes-marker', 'citation-footnote-label'),
      );
    }

    if (markdownFootnotes.length > 0) {
      content = appendBlock(
        content,
        renderCitationListBlock(markdownFootnotes, 'citation-footnotes-marker', 'citation-footnote-label'),
      );
    }

    if (hadRefsBlock) {
      referencesWereRequested = true;

      if (isEffectivelyEmpty(content)) {
        content = appendBlock('## References', bibliographyBlock);
        referencesInserted = bibliographyBlock !== '';
      } else if (slideHasReferenceHeading(content)) {
        content = appendBlock(content, bibliographyBlock);
        referencesInserted = bibliographyBlock !== '';
      }
    }

    transformedSlides.push(content);
  }

  if (bibliographyBlock !== '' && (!referencesWereRequested || !referencesInserted)) {
    transformedSlides.push(appendBlock('## References', bibliographyBlock));
  }

  return joinSlides({
    frontMatter: rawFrontMatter,
    slides: transformedSlides,
    hasTrailingNewline,
  });
}
