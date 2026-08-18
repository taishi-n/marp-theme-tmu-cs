import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Cite, plugins } from '@citation-js/core';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';
import { escapeHtmlAttribute } from '../../../core/html.mjs';
import { transformMarkdownText } from '../../../core/markdown-text.mjs';
import { collectInlineReferenceOrder, escapeHtml } from '../markdown-utils.mjs';

const DEFAULT_LOCALE = 'en-US';
const xhtmlNamespacePattern = /\s+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/gu;
const inlineCitationMarkerPattern = /(?<![A-Za-z0-9_])-?@[A-Za-z0-9_:.#$%&+?/<>-]+/u;
const serializer = new XMLSerializer();
const domParser = new DOMParser({
  onError: () => {},
});

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function createBackendError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
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

function appendSupplementalBibliographyLinks(bodyHtml, entry) {
  const doi = normalizeDoi(entry?.DOI ?? entry?.doi);
  const url = normalizeUrl(entry?.URL ?? entry?.url);
  const links = [];

  if (doi) links.push({ href: `https://doi.org/${doi}`, label: 'DOI' });
  if (url && (!doi || url !== `https://doi.org/${doi}`)) links.push({ href: url, label: 'URL' });
  if (links.length === 0) return bodyHtml;

  const linksHtml = links
    .map((link) => `[<a href="${escapeHtmlAttribute(link.href)}">${link.label}</a>]`)
    .join(' ');

  return `${bodyHtml} <span class="citation-links">${linksHtml}</span>`;
}

function serializeNodes(nodes) {
  return nodes
    .map((node) => serializer.serializeToString(node))
    .join('')
    .replace(xhtmlNamespacePattern, '');
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

function loadBibliographyEntries(bibliographyPaths) {
  if (!Array.isArray(bibliographyPaths) || bibliographyPaths.length === 0) {
    throw createBackendError('JS_CITATION_NO_BIBLIOGRAPHY', 'citation backend requires at least one bibliography file.');
  }

  const source = bibliographyPaths
    .map((bibliographyPath) => readFileSync(bibliographyPath, 'utf8'))
    .join('\n\n');

  try {
    return new Cite(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createBackendError('JS_CITATION_BIBLIOGRAPHY_PARSE_FAILED', `failed to parse bibliography with Citation.js. ${message}`, error);
  }
}

function ensureTemplateRegistered(templatePath, templateXml) {
  const templateConfig = plugins.config.get('@csl')?.templates;
  if (!templateConfig) {
    throw createBackendError('JS_CITATION_TEMPLATE_CONFIG_MISSING', 'Citation.js CSL template registry is unavailable.');
  }

  const templateName = `tmu-cs-${basename(templatePath).replace(/[^A-Za-z0-9_-]/g, '-')}`;
  if (!templateConfig.has(templateName)) templateConfig.add(templateName, templateXml);
  return templateName;
}

function resolveTemplate(context = {}) {
  const explicitCslPath = asNonEmptyString(context.cslPath);
  const defaultCslPath = asNonEmptyString(context.defaultCslPath);
  const markdownPath = asNonEmptyString(context.markdownPath);
  const basePath = markdownPath ? resolve(markdownPath, '..') : process.cwd();

  if (explicitCslPath) {
    const resolvedCslPath = resolve(basePath, explicitCslPath);
    const cslXml = readFileSync(resolvedCslPath, 'utf8');
    return ensureTemplateRegistered(resolvedCslPath, cslXml);
  }

  if (defaultCslPath) {
    const cslXml = readFileSync(defaultCslPath, 'utf8');
    return ensureTemplateRegistered(defaultCslPath, cslXml);
  }

  return 'apa';
}

function createEntriesByKey(cite, template) {
  const entryMap = new Map(cite.data.map((entry) => [entry.id, entry]));
  const bibliographyEntries = cite.format('bibliography', {
    asEntryArray: true,
    format: 'html',
    lang: DEFAULT_LOCALE,
    template,
  });

  const allEntries = bibliographyEntries.map(([key, rawHtml]) => {
    const wrappedHtml = `<html><body>${String(rawHtml ?? '').trim()}</body></html>`;
    const document = domParser.parseFromString(wrappedHtml, 'text/html');
    const root = document.getElementsByTagName('body')[0];
    const entryNode = root?.firstChild?.nodeType === 1 ? root.firstChild : findFirstDescendantByClass(root, 'csl-entry');
    const labelNode = findFirstDescendantByClass(entryNode, 'csl-left-margin');
    const bodyNode = findFirstDescendantByClass(entryNode, 'csl-right-inline')
      ?? findFirstDescendantByClass(entryNode, 'csl-indent')
      ?? entryNode;
    const label = asNonEmptyString(labelNode?.textContent?.replace(/\s+/gu, ' '));
    const bodyHtml = appendSupplementalBibliographyLinks(
      normalizeBibliographyBodyHtml(
        bodyNode
          ? serializeNodes(Array.from(bodyNode.childNodes))
          : String(rawHtml ?? '').trim(),
      ),
      entryMap.get(key),
    );

    return {
      bodyHtml,
      key,
      label,
    };
  });

  return {
    allEntries,
    entriesByKey: new Map(allEntries.map((entry) => [entry.key, entry])),
  };
}

function escapeCitationText(value) {
  return `<span class="citation-ref">${escapeHtml(value)}</span>`;
}

function parseCitationItem(rawItem) {
  const source = String(rawItem ?? '');
  const match = source.match(/^(.*?)(?<![A-Za-z0-9_])(-?)@([A-Za-z0-9_:.#$%&+?/<>-]+)([\s\S]*)$/u);
  if (!match) return null;

  const prefix = match[1];
  const suppressAuthor = match[2] === '-';
  const id = match[3];
  const suffix = match[4];

  return {
    id,
    prefix: prefix.trim() === '' ? undefined : prefix.trim(),
    suppressAuthor,
    suffix: suffix.trim() === '' ? undefined : suffix.trim(),
  };
}

function splitCitationCluster(rawText) {
  const items = [];
  let current = '';
  let braceDepth = 0;

  for (const character of String(rawText ?? '')) {
    if (character === '{') braceDepth += 1;
    if (character === '}') braceDepth = Math.max(0, braceDepth - 1);

    if (character === ';' && braceDepth === 0) {
      items.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  items.push(current);
  return items;
}

function parseCitationCluster(rawText) {
  const items = splitCitationCluster(rawText).map(parseCitationItem);
  if (items.length === 0 || items.some((item) => item === null)) {
    throw createBackendError('JS_CITATION_UNSUPPORTED', 'encountered citation syntax that is not supported by the JS backend.');
  }
  return items;
}

function createCitationStateItem(items) {
  return {
    citationItems: items.map((item) => {
      const citeItem = { id: item.id };
      if (item.prefix) citeItem.prefix = item.prefix;
      if (item.suffix) citeItem.suffix = item.suffix;
      if (item.suppressAuthor) citeItem['suppress-author'] = true;
      return citeItem;
    }),
    properties: {
      noteIndex: 0,
    },
  };
}

function formatCitationCluster(cite, template, items, citationHistory) {
  try {
    const citationStateItem = createCitationStateItem(items);
    return cite.format('citation', {
      entry: citationStateItem.citationItems,
      citationsPre: citationHistory,
      format: 'text',
      lang: DEFAULT_LOCALE,
      template,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createBackendError('JS_CITATION_FORMAT_FAILED', `failed to format citation with citeproc. ${message}`, error);
  }
}

function applyReferenceNumbers(citationText, items, referenceNumbers) {
  const numbers = items.map((item) => referenceNumbers.get(`citation:${item.id}`));
  if (numbers.some((number) => !Number.isInteger(number))) return citationText;

  if (/^\s*(?:\[\d+\](?:\s*[,–-]\s*\[?\d+\]?)*)\s*$/u.test(citationText)) {
    return `[${numbers.join(', ')}]`;
  }

  return citationText;
}

function replaceInlineCitations(slideContent, cite, template, citationHistory) {
  const citedKeys = [];
  const seenKeys = new Set();
  const referenceOrder = collectInlineReferenceOrder(slideContent);
  const referenceNumbers = new Map(referenceOrder.map((reference, index) => [
    reference.type === 'citation' ? `citation:${reference.key}` : `footnote:${reference.id}`,
    index + 1,
  ]));
  const content = transformMarkdownText(slideContent, (text) => (
    text.replace(/\[((?:\\.|[^\]\\])*)\]/gu, (match, contentText) => {
          if (!inlineCitationMarkerPattern.test(String(contentText))) return match;

          const items = parseCitationCluster(contentText);
          for (const item of items) {
            if (seenKeys.has(item.id)) continue;
            seenKeys.add(item.id);
            citedKeys.push(item.id);
          }

          const citationText = applyReferenceNumbers(
            formatCitationCluster(cite, template, items, citationHistory),
            items,
            referenceNumbers,
          );
          citationHistory.push(createCitationStateItem(items));
          return escapeCitationText(citationText);
        })
  ));

  return {
    citedKeys,
    content,
    referenceOrder,
  };
}

export function createJsCitationBackend() {
  return {
    name: 'js',

    render(slides, context = {}) {
      const markdownPath = asNonEmptyString(context.markdownPath);
      const markdownDir = markdownPath ? resolve(markdownPath, '..') : process.cwd();
      const bibliographyPaths = (context.bibliographyReferences ?? []).map((reference) => resolve(markdownDir, reference));
      const cite = loadBibliographyEntries(bibliographyPaths);
      const template = resolveTemplate(context);
      const { allEntries, entriesByKey } = createEntriesByKey(cite, template);
      const citationHistory = [];

      return {
        allEntries,
        entriesByKey,
        metadata: {
          backend: 'js',
          template,
        },
        slides: slides.map((slide) => replaceInlineCitations(slide.content ?? slide, cite, template, citationHistory)),
      };
    },
  };
}

export default createJsCitationBackend;
