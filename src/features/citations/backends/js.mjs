import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Cite, plugins } from '@citation-js/core';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';
import { escapeHtmlAttribute } from '../../../core/html.mjs';
import { isFenceClose, parseFenceStart } from '../../../core/markdown.mjs';
import { escapeHtml } from '../markdown-utils.mjs';

const DEFAULT_LOCALE = 'en-US';
const xhtmlNamespacePattern = /\s+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/gu;
const serializer = new XMLSerializer();
const domParser = new DOMParser({
  onError: () => {},
});

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function createBackendError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
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
  const match = source.match(/^(.*?)(-?)@([A-Za-z0-9_:.#$%&+?/<>\-]+)([\s\S]*)$/u);
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

function replaceInlineCitations(slideContent, cite, template, citationHistory) {
  const citedKeys = [];
  const seenKeys = new Set();
  let fence = null;
  let inHtmlComment = false;

  const updateHtmlCommentState = (line) => {
    let index = 0;
    let state = inHtmlComment;

    while (index < line.length) {
      if (!state) {
        const openIndex = line.indexOf('<!--', index);
        if (openIndex === -1) break;
        state = true;
        index = openIndex + 4;
        continue;
      }

      const closeIndex = line.indexOf('-->', index);
      if (closeIndex === -1) break;
      state = false;
      index = closeIndex + 3;
    }

    inHtmlComment = state;
  };

  const content = String(slideContent ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (!fence) {
        if (inHtmlComment) {
          updateHtmlCommentState(line);
          return line;
        }

        const fenceStart = parseFenceStart(line);
        if (fenceStart) {
          fence = fenceStart;
          return line;
        }

        updateHtmlCommentState(line);
        if (inHtmlComment) return line;

        return line.replace(/\[((?:\\.|[^\]\\])*)\]/gu, (match, contentText) => {
          if (!String(contentText).includes('@')) return match;

          const items = parseCitationCluster(contentText);
          for (const item of items) {
            if (seenKeys.has(item.id)) continue;
            seenKeys.add(item.id);
            citedKeys.push(item.id);
          }

          const citationText = formatCitationCluster(cite, template, items, citationHistory);
          citationHistory.push(createCitationStateItem(items));
          return escapeCitationText(citationText);
        });
      }

      if (isFenceClose(line, fence)) fence = null;
      return line;
    })
    .join('\n');

  return {
    citedKeys,
    content,
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
