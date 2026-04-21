import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, delimiter, resolve } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { escapeHtml, protectMarkdownFootnotes } from '../markdown-utils.mjs';

const xhtmlNamespacePattern = /\s+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/gu;
const serializer = new XMLSerializer();
const domParser = new DOMParser({
  onError: () => {},
});

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
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

function reportPandocMessages(stderr, onWarning) {
  const message = String(stderr ?? '').trim();
  if (message === '') return;

  for (const line of message.split(/\r?\n/u)) {
    const trimmedLine = line.trim();
    if (trimmedLine !== '') onWarning?.({ message: trimmedLine });
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
    const error = new Error(`failed to start pandoc. ${result.error.message}`);
    error.code = 'PANDOC_UNAVAILABLE';
    throw error;
  }

  if (result.status !== 0) {
    const detail = String(result.stderr ?? '').trim() || `pandoc exited with status ${result.status}.`;
    const error = new Error(detail);
    error.code = 'PANDOC_FAILED';
    throw error;
  }

  return result.stdout;
}

export function createPandocCitationBackend(options = {}) {
  return {
    name: 'pandoc',

    render(markdown, context = {}) {
      const defaultCslPath = resolve(context.defaultCslPath ?? options.defaultCslPath ?? '');
      const pandocCiteFilterPath = resolve(context.pandocCiteFilterPath ?? options.pandocCiteFilterPath ?? '');
      const markdownPath = asNonEmptyString(context.markdownPath)
        ? resolve(context.markdownPath)
        : undefined;
      const fallbackMarkdownDir = process.cwd();
      const markdownDir = markdownPath ? dirname(markdownPath) : fallbackMarkdownDir;
      const bibliographyPaths = (context.bibliographyReferences ?? []).map((reference) => resolve(markdownDir, reference));
      const tempDirectory = mkdtempSync(resolve(tmpdir(), 'tmu-cs-citeproc-'));
      const pandocInputPath = resolve(tempDirectory, markdownPath ? 'slides-protected.md' : 'slides.md');
      const resourcePath = [markdownDir, dirname(defaultCslPath)].join(delimiter);
      const commonArgs = [
        '--from', 'markdown',
        '--resource-path', resourcePath,
        '--citeproc',
        '--lua-filter', pandocCiteFilterPath,
      ];

      if (!asNonEmptyString(context.cslPath)) {
        commonArgs.push('--csl', defaultCslPath);
      }

      writeFileSync(pandocInputPath, protectMarkdownFootnotes(markdown), 'utf8');

      try {
        const renderedMarkdown = runPandoc(
          [
            '--standalone',
            '--to', 'markdown',
            '--wrap=preserve',
            ...commonArgs,
            pandocInputPath,
          ],
          {
            cwd: markdownDir,
            onWarning: context.onWarning,
          },
        );

        const bibliographyHtml = runPandoc(
          [
            '--to', 'html',
            '--wrap=none',
            ...commonArgs,
            pandocInputPath,
          ],
          {
            cwd: markdownDir,
            onWarning: context.onWarning,
          },
        );

        const bibliographyLinkMetadata = parseBibliographyLinkMetadata(
          runPandoc(
            [
              '--from', 'bibtex',
              '--to', 'csljson',
              ...bibliographyPaths,
            ],
            {
              cwd: markdownDir,
              onWarning: context.onWarning,
            },
          ),
        );
        const { entries, entriesByKey } = parseBibliographyEntries(bibliographyHtml, bibliographyLinkMetadata);

        return {
          allEntries: entries,
          entriesByKey,
          metadata: {
            backend: 'pandoc',
          },
          renderedMarkdown,
        };
      } finally {
        rmSync(tempDirectory, { force: true, recursive: true });
      }
    },
  };
}

export default createPandocCitationBackend;
