import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Cite, plugins } from '@citation-js/core';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';

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

function escapeMarkdownAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeCitationPlaceholderText(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}');
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
    .map((link) => `[<a href="${escapeMarkdownAttribute(link.href)}">${link.label}</a>]`)
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

function isCitationDelimiter(character) {
  return character === ';';
}

function parseCitationItem(rawItem) {
  const trimmed = rawItem.trim();
  if (trimmed === '') return null;

  const match = trimmed.match(/^(-?)@([A-Za-z0-9_:.#$%&+?/<>\-]+)$/u);
  if (!match) return null;

  return {
    suppressAuthor: match[1] === '-',
    id: match[2],
  };
}

function parseCitationCluster(rawText) {
  const items = rawText.split(';').map(parseCitationItem);
  if (items.some((item) => item === null) || items.length === 0) return null;
  return items;
}

function formatCitationCluster(cite, template, items) {
  try {
    return cite.format('citation', {
      entry: items.map((item) => (
        item.suppressAuthor
          ? { id: item.id, 'suppress-author': true }
          : { id: item.id }
      )),
      format: 'text',
      lang: DEFAULT_LOCALE,
      template,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createBackendError('JS_CITATION_FORMAT_FAILED', `failed to format citation with citeproc-js. ${message}`, error);
  }
}

function replaceBracketCitations(markdown, cite, template) {
  let changed = false;
  let fallbackNeeded = false;
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

  const parseFenceStart = (line) => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!match) return null;
    return { marker: match[1][0], length: match[1].length };
  };

  const isFenceClose = (line, currentFence) => {
    if (!currentFence) return false;
    const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    return Boolean(match && match[1][0] === currentFence.marker && match[1].length >= currentFence.length);
  };

  const output = String(markdown ?? '')
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

        return line.replace(/\[((?:\\.|[^\]\\])*)\]/gu, (match, content) => {
          if (!String(content).includes('@')) return match;

          const items = parseCitationCluster(content);
          if (!items) {
            fallbackNeeded = true;
            return match;
          }

          const citationText = formatCitationCluster(cite, template, items);
          changed = true;
          return `[${escapeCitationPlaceholderText(citationText)}]{.citation-placeholder data-cite-keys="${escapeMarkdownAttribute(items.map((item) => item.id).join(';'))}"}`;
        });
      }

      if (isFenceClose(line, fence)) fence = null;
      return line;
    })
    .join('\n');

  if (fallbackNeeded) {
    throw createBackendError(
      'JS_CITATION_UNSUPPORTED',
      'encountered citation syntax that is not yet supported by the JS citation backend.',
    );
  }

  return {
    changed,
    markdown: output,
  };
}

export function createJsCitationBackend() {
  return {
    name: 'js',

    render(markdown, context = {}) {
      const markdownPath = asNonEmptyString(context.markdownPath);
      const markdownDir = markdownPath ? resolve(markdownPath, '..') : process.cwd();
      const bibliographyPaths = (context.bibliographyReferences ?? []).map((reference) => resolve(markdownDir, reference));
      const cite = loadBibliographyEntries(bibliographyPaths);
      const template = resolveTemplate(context);
      const rendered = replaceBracketCitations(markdown, cite, template);
      const { allEntries, entriesByKey } = createEntriesByKey(cite, template);

      return {
        allEntries,
        entriesByKey,
        metadata: {
          backend: 'js',
          template,
        },
        renderedMarkdown: rendered.markdown,
      };
    },
  };
}

export default createJsCitationBackend;
