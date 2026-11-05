import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, parseFragment, serialize, serializeOuter } from 'parse5';
import { replaceHtmlRanges } from '../core/html.mjs';
import { cssResourceReferences, isEmbeddedReference, nodeResourceReferences, parseSrcsetCandidates, resourceAttributes } from '../core/html-resources.mjs';
import { createAssetContext, detectMimeType, loadAsset, resolveNestedBase, resolveReference, toDataUrl } from './asset-loader.mjs';
import { resolveConstrainedFilePath } from '../core/local-path.mjs';

function parseHtml(html) {
  return /<(?:!doctype\s+html|html)\b/iu.test(html) ? parse(html) : parseFragment(html);
}

function getAttribute(node, name) {
  return node?.attrs?.find((attribute) => (attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name) === name)?.value;
}

function setAttribute(node, name, value) {
  node.attrs ??= [];
  const attribute = node.attrs.find((candidate) => (candidate.prefix ? `${candidate.prefix}:${candidate.name}` : candidate.name) === name);
  if (attribute) attribute.value = String(value);
  else node.attrs.push({ name, value: String(value) });
}

function removeAttribute(node, name) {
  node.attrs = (node.attrs ?? []).filter((attribute) => attribute.name !== name);
}

function walk(node, visit) {
  visit(node);
  for (const child of [...(node?.childNodes ?? []), ...(node?.content?.childNodes ?? [])]) walk(child, visit);
}

function inlineCssReferences(css, context, basePath, embedRemote = true, imports = new Set()) {
  const source = String(css ?? '');
  return replaceHtmlRanges(source, cssResourceReferences(source).map((reference) => {
    const resolved = resolveReference(reference.reference, basePath);
    if (!resolved || (!embedRemote && resolved.kind === 'remote')) return { ...reference, html: source.slice(reference.start, reference.end) };
    let asset = loadAsset(reference.reference, context, basePath);
    if (detectMimeType(reference.reference, asset.mimeType) === 'text/css') {
      const nestedBase = resolveNestedBase(reference.reference, basePath);
      if (imports.has(nestedBase)) throw new Error(`[tmu-cs] standalone mode found a circular CSS import: "${reference.reference}".`);
      const css = inlineCssReferences(asset.buffer.toString('utf8'), context, nestedBase, embedRemote, new Set([...imports, nestedBase]));
      asset = { ...asset, buffer: Buffer.from(css) };
    }
    return { ...reference, html: `${reference.import ? '@import ' : ''}url("${toDataUrl(reference.reference, asset)}")` };
  }));
}

function setTextContent(node, value) {
  const textNode = {
    nodeName: '#text',
    parentNode: node,
    value: String(value),
  };
  node.childNodes = [textNode];
}

function inlineStylesheet(node, context, basePath) {
  const href = getAttribute(node, 'href');
  const asset = loadAsset(href, context, basePath);
  if (!asset) return;

  node.nodeName = 'style';
  node.tagName = 'style';
  removeAttribute(node, 'href');
  removeAttribute(node, 'rel');
  setTextContent(node, inlineCssReferences(asset.buffer.toString('utf8'), context, resolveNestedBase(href, basePath)));
}

function inlineScript(node, context, basePath) {
  const source = getAttribute(node, 'src');
  const asset = loadAsset(source, context, basePath);
  if (!asset) return;
  removeAttribute(node, 'src');
  setTextContent(node, asset.buffer.toString('utf8'));
}

function inlineIframe(node, context, basePath) {
  const source = getAttribute(node, 'src');
  if (!source) return;
  if (resolveReference(source, basePath)?.kind === 'remote') {
    throw new Error(`[tmu-cs] standalone mode cannot embed remote iframe "${source}".`);
  }
  if (resolveReference(source, basePath)?.kind !== 'local' || !/\.html?$/iu.test(source.replace(/[?#].*$/u, ''))) {
    throw new Error(`[tmu-cs] standalone mode supports only local HTML iframe sources. Received "${source}".`);
  }

  const iframePath = resolveConstrainedFilePath(resolveNestedBase(source, basePath), {
    allowOutsideRoot: context.allowLocalFiles,
    inputRoot: context.inputRoot,
  });
  if (context.visitedHtml.has(iframePath)) {
    throw new Error(`[tmu-cs] standalone mode detected a recursive iframe at "${iframePath}".`);
  }

  let iframeHtml;
  try {
    iframeHtml = readFileSync(iframePath, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[tmu-cs] standalone mode could not embed iframe "${source}". ${detail}`, { cause: error });
  }

  context.visitedHtml.add(iframePath);
  try {
    removeAttribute(node, 'src');
    setAttribute(node, 'srcdoc', inlineHtmlDocument(iframeHtml, context, iframePath));
  } finally {
    context.visitedHtml.delete(iframePath);
  }
}

function withIntrinsicSvgDimensions(asset) {
  if (detectMimeType('', asset.mimeType) !== 'image/svg+xml') return asset;
  const source = asset.buffer.toString('utf8');
  const opening = source.match(/<svg\b[^>]*>/iu)?.[0];
  if (!opening) return asset;
  const svg = parseFragment(`${opening}</svg>`).childNodes.find(node => node.nodeName === 'svg');
  if (!svg) return asset;
  const viewBox = String(getAttribute(svg, 'viewBox') ?? '').trim().split(/[\s,]+/u).map(Number);
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) return asset;
  const absoluteSize = value => {
    const match = String(value ?? '').match(/^(\d+(?:\.\d+)?)(px|pt|pc|in|cm|mm|q)?$/iu);
    if (!match || Number(match[1]) <= 0) return undefined;
    const units = { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 };
    return Number(match[1]) * (units[match[2]?.toLowerCase() ?? 'px']);
  };
  const width = absoluteSize(getAttribute(svg, 'width'));
  const height = absoluteSize(getAttribute(svg, 'height'));
  if (width && height) return asset;
  const ratio = viewBox[2] / viewBox[3];
  setAttribute(svg, 'width', width ?? (height ? height * ratio : viewBox[2]));
  setAttribute(svg, 'height', height ?? (width ? width / ratio : viewBox[3]));
  let normalizedOpening = serializeOuter(/** @type {any} */ (svg)).replace(/<\/svg>$/u, '');
  if (opening.endsWith('/>')) normalizedOpening = normalizedOpening.replace(/>$/u, '/>');
  return { ...asset, buffer: Buffer.from(source.replace(opening, normalizedOpening)) };
}

function inlineUrlAttribute(node, attributeName, context, basePath) {
  const reference = getAttribute(node, attributeName);
  if (!reference) return;
  if (node.tagName === 'use' && !reference.trim().startsWith('#')) {
    throw new Error('[tmu-cs] standalone mode requires SVG use references to point to inline fragment IDs.');
  }
  const asset = loadAsset(reference, context, basePath);
  if (asset) setAttribute(node, attributeName, toDataUrl(reference, node.tagName === 'img' ? withIntrinsicSvgDimensions(asset) : asset));
}

function inlineSrcset(node, context, basePath) {
  const srcset = getAttribute(node, 'srcset');
  if (!srcset) return;

  const embedded = parseSrcsetCandidates(srcset).map(({ descriptor, url }) => {
    const asset = loadAsset(url, context, basePath);
    const embeddedUrl = asset ? toDataUrl(url, asset) : url;
    return `${embeddedUrl}${descriptor ? ` ${descriptor}` : ''}`;
  });
  setAttribute(node, 'srcset', embedded.join(', '));
}

function assertStandaloneDocument(document) {
  const unresolved = [];
  walk(document, (node) => {
    for (const value of nodeResourceReferences(node)) {
      if (!isEmbeddedReference(value)) unresolved.push(`${node.tagName} resource="${value}"`);
    }
  });
  if (unresolved.length > 0) {
    throw new Error(`[tmu-cs] standalone mode left embeddable references unresolved: ${unresolved.join(', ')}`);
  }
}

function inlineHtmlDocument(html, context, basePath = context.basePath) {
  const document = parseHtml(String(html ?? ''));

  walk(document, (node) => {
    if (!node?.tagName) return;

    if (node.tagName === 'link' && String(getAttribute(node, 'rel') ?? '').toLowerCase() === 'stylesheet') {
      inlineStylesheet(node, context, basePath);
      return;
    }
    if (node.tagName === 'link' && getAttribute(node, 'href')) {
      inlineUrlAttribute(node, 'href', context, basePath);
      return;
    }
    if (node.tagName === 'script' && getAttribute(node, 'src')) {
      inlineScript(node, context, basePath);
      return;
    }
    if (node.tagName === 'style') {
      const css = (node.childNodes ?? []).map((child) => child.value ?? '').join('');
      setTextContent(node, inlineCssReferences(css, context, basePath));
      return;
    }
    if (node.tagName === 'iframe' && getAttribute(node, 'srcdoc')) {
      setAttribute(node, 'srcdoc', inlineHtmlDocument(getAttribute(node, 'srcdoc'), context, basePath));
      return;
    }
    if (node.tagName === 'iframe' && getAttribute(node, 'src')) {
      inlineIframe(node, context, basePath);
      return;
    }

    for (const attribute of resourceAttributes(node)) {
      inlineUrlAttribute(node, attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name, context, basePath);
    }
    if (getAttribute(node, 'srcset')) inlineSrcset(node, context, basePath);

    const style = getAttribute(node, 'style');
    if (style) setAttribute(node, 'style', inlineCssReferences(style, context, basePath));
  });

  assertStandaloneDocument(document);
  return serialize(document);
}

export function inlineStylesheetAssets(css, options = {}) {
  const basePath = options.stylesheetPath ?? resolve(process.cwd(), 'slide.css');
  return inlineCssReferences(css, createAssetContext(basePath, options), basePath, options.embedRemote === true);
}

export default function inlineStandaloneAssets(html, options = {}) {
  const basePath = options.markdownPath ?? resolve(process.cwd(), 'slides.md');
  if (typeof basePath !== 'string' || basePath === '') {
    throw new Error('[tmu-cs] standalone mode requires the markdown or output path to resolve local assets.');
  }
  const context = createAssetContext(basePath, options);

  return inlineHtmlDocument(html, context);
}
