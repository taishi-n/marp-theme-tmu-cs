import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { containsCitationSyntax } from '../features/citations/markdown-utils.mjs';
import { nodeResourceReferences, resolveResourceUrl } from '../core/html-resources.mjs';

function attribute(node, name) { return node.attrs?.find((entry) => entry.name === name)?.value; }

/** Static structure and resource checks; no browser, network, or layout execution. */
export function checkDeck(html, options = {}) {
  const document = parse(String(html));
  const diagnostics = [];
  const externalAssets = [];
  const sections = [];
  let embeddedAssets = 0;
  let base = pathToFileURL(resolve(options.htmlPath ?? 'slides.html'));
  const ids = new Set();
  const add = (code, message, section) => diagnostics.push({ code, message,
    slideId: section ? attribute(section, 'data-slide-id') ?? `page-${sections.indexOf(section) + 1}` : null,
    sourceLine: section ? Number(attribute(section, 'data-source-line')) || null : null });

  function resource(reference, section) {
    if (!reference || reference.startsWith('#')) return;
    if (reference.startsWith('data:')) { embeddedAssets += 1; return; }
    try {
      const url = resolveResourceUrl(reference, base);
      if (url.protocol === 'file:') {
        if (!existsSync(fileURLToPath(url))) add('MISSING_ASSET', `Missing asset: ${reference}`, section);
        else if (options.standalone) add('UNEMBEDDED_ASSET', `Local asset is not embedded: ${reference}`, section);
      } else if (['http:', 'https:'].includes(url.protocol)) {
        externalAssets.push(reference);
        if (options.standalone) add('EXTERNAL_ASSET', `External asset is not embedded: ${reference}`, section);
      } else add('NONPORTABLE_ASSET', `Unsupported asset URL: ${reference}`, section);
    } catch {
      add('INVALID_ASSET', `Invalid asset URL: ${reference}`, section);
    }
  }

  function visit(node, outerSection = null, protectedText = false) {
    const section = node.tagName === 'section' && !outerSection ? node : outerSection;
    if (section === node) {
      sections.push(node);
      const id = attribute(node, 'data-slide-id');
      if (id && ids.has(id)) add('DUPLICATE_ID', `Duplicate slide ID: ${id}`, section);
      if (id) ids.add(id);
    }
    if (node.tagName === 'base' && attribute(node, 'href')) base = new URL(attribute(node, 'href'), base);
    for (const reference of nodeResourceReferences(node)) resource(reference, section);
    if (node.tagName === 'merror' || attribute(node, 'data-mml-node') === 'merror' || attribute(node, 'data-mjx-error') !== undefined || /(?:^|\s)mjx-merror(?:\s|$)/u.test(attribute(node, 'class') ?? '')) {
      add('MATH_ERROR', attribute(node, 'data-mjx-error') || 'Rendered mathematics contains an error.', section);
    }
    if (!protectedText && node.nodeName === '#text' && containsCitationSyntax(node.value)) add('UNRESOLVED_CITATION', `Unresolved citation: ${node.value.trim()}`, section);
    const protect = protectedText || ['code', 'pre', 'script', 'style', 'textarea', 'template'].includes(node.tagName);
    for (const child of node.childNodes ?? []) visit(child, section, protect);
  }
  visit(document);
  if (sections.length === 0) add('NO_SLIDES', 'No slides found.', null);
  if (options.index) {
    const index = options.index;
    if (index.version !== 1 || !Array.isArray(index.slides)) add('INVALID_INDEX', 'Expected a version-1 slide index.', null);
    else {
      if (index.slides.length !== sections.length) add('INDEX_COUNT', 'Index and HTML have different slide counts.', null);
      for (const [offset, section] of sections.entries()) {
        const record = index.slides[offset];
        if (!record || record.id !== attribute(section, 'data-slide-id') || record.physicalPage !== offset + 1) {
          add('INDEX_SLIDE', `Index does not match physical page ${offset + 1}.`, section);
        } else if ([['sourceLine', 'data-source-line'], ['number', 'data-marpit-pagination'], ['total', 'data-marpit-pagination-total']]
          .some(([key, name]) => Object.hasOwn(record, key) && record[key] !== (Number(attribute(section, name)) || null))) {
          add('INDEX_METADATA', `Index metadata does not match physical page ${offset + 1}.`, section);
        }
      }
    }
  }
  return { version: 1, ok: diagnostics.length === 0, slideCount: sections.length,
    embeddedAssets, externalAssets: [...new Set(externalAssets)], diagnostics, visualReview: 'not-performed' };
}
