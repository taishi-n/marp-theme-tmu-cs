import { readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { escapeHtml, escapeHtmlAttribute } from '../core/html.mjs';

const binaryMimeTypes = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
]);

const textMimeTypes = new Map([
  ['.css', 'text/css'],
  ['.htm', 'text/html'],
  ['.html', 'text/html'],
  ['.js', 'text/javascript'],
  ['.mjs', 'text/javascript'],
  ['.svg', 'image/svg+xml'],
]);

function parseHtmlAttributes(input = '') {
  const attributes = {};

  for (const match of String(input ?? '').matchAll(/([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
    const key = match[1];
    if (!key) continue;
    attributes[key] = match[2] ?? match[3] ?? '';
  }

  return attributes;
}

function serializeAttributes(attributes = {}, options = {}) {
  const excluded = new Set(options.exclude ?? []);

  return Object.entries(attributes)
    .filter(([key]) => !excluded.has(key))
    .map(([key, value]) => {
      if (value === '') return key;
      return `${key}="${escapeHtmlAttribute(value)}"`;
    })
    .join(' ');
}

function stripUrlSuffix(value = '') {
  return String(value ?? '').replace(/[?#].*$/u, '');
}

function isLocalRelativeReference(reference = '') {
  const value = String(reference ?? '').trim();

  if (value === '') return false;
  if (value.startsWith('#')) return false;
  if (value.startsWith('data:')) return false;
  if (value.startsWith('blob:')) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;
  if (value.startsWith('//')) return false;
  if (isAbsolute(value)) return false;

  return true;
}

function resolveLocalReference(reference, basePath) {
  const cleanReference = stripUrlSuffix(reference);
  const baseDir = dirname(basePath);
  return resolve(baseDir, cleanReference);
}

function detectMimeType(filePath) {
  const extension = extname(filePath).toLowerCase();
  return binaryMimeTypes.get(extension) ?? textMimeTypes.get(extension) ?? 'application/octet-stream';
}

function isTextAsset(filePath) {
  return textMimeTypes.has(extname(filePath).toLowerCase());
}

function readAsset(filePath, options = {}) {
  try {
    return readFileSync(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.onWarning?.(`failed to read local asset "${filePath}". ${message}`);
    return null;
  }
}

function toDataUrl(filePath, options = {}) {
  const buffer = readAsset(filePath, options);
  if (!buffer) return null;

  const mimeType = detectMimeType(filePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function inlineLocalAttributeReference(html, spec, context) {
  const pattern = new RegExp(`<${spec.tag}\\b([^>]*)>`, 'giu');

  return String(html ?? '').replace(pattern, (match, rawAttributes) => {
    const attributes = parseHtmlAttributes(rawAttributes);
    const source = attributes[spec.attribute] ?? '';

    if (!isLocalRelativeReference(source)) return match;

    const resolvedPath = resolveLocalReference(source, context.basePath);
    const dataUrl = toDataUrl(resolvedPath, context);
    if (!dataUrl) return match;

    attributes[spec.attribute] = dataUrl;
    const serializedAttributes = serializeAttributes(attributes, { allowEmpty: true });
    return `<${spec.tag}${serializedAttributes ? ` ${serializedAttributes}` : ''}>`;
  });
}

function inlineGifPlayerDataSource(html, context) {
  return String(html ?? '').replace(/<span\b([^>]*)class="tmu-cs-gif-player"([^>]*)>/giu, (match, left, right) => {
    const attributes = parseHtmlAttributes(`${left} ${right}`);
    const source = attributes['data-gif-src'] ?? '';

    if (!isLocalRelativeReference(source)) return match;

    const resolvedPath = resolveLocalReference(source, context.basePath);
    const dataUrl = toDataUrl(resolvedPath, context);
    if (!dataUrl) return match;

    attributes['data-gif-src'] = dataUrl;
    const serializedAttributes = serializeAttributes(attributes, { allowEmpty: true });
    return `<span${serializedAttributes ? ` ${serializedAttributes}` : ''}>`;
  });
}

function inlineLocalScripts(html, context) {
  return String(html ?? '').replace(/<script\b([^>]*)src=(?:"([^"]*)"|'([^']*)')([^>]*)><\/script>/giu, (match, beforeSrc, doubleQuotedSrc, singleQuotedSrc, afterSrc) => {
    const attributes = parseHtmlAttributes(`${beforeSrc} src="${doubleQuotedSrc ?? singleQuotedSrc ?? ''}" ${afterSrc}`);
    const source = attributes.src ?? '';

    if (!isLocalRelativeReference(source)) return match;

    const resolvedPath = resolveLocalReference(source, context.basePath);
    if (!isTextAsset(resolvedPath)) return match;

    const scriptBuffer = readAsset(resolvedPath, context);
    if (!scriptBuffer) return match;

    const scriptContent = scriptBuffer.toString('utf8');
    const serializedAttributes = serializeAttributes(attributes, {
      allowEmpty: true,
      exclude: ['src'],
    });

    return `<script${serializedAttributes ? ` ${serializedAttributes}` : ''}>${scriptContent}</script>`;
  });
}

function inlineLocalStylesheets(html, context) {
  return String(html ?? '').replace(/<link\b([^>]*)>/giu, (match, rawAttributes) => {
    const attributes = parseHtmlAttributes(rawAttributes);
    const relation = String(attributes.rel ?? '').toLowerCase();
    const href = attributes.href ?? '';

    if (relation !== 'stylesheet' || !isLocalRelativeReference(href)) return match;

    const resolvedPath = resolveLocalReference(href, context.basePath);
    const cssBuffer = readAsset(resolvedPath, context);
    if (!cssBuffer) return match;

    const serializedAttributes = serializeAttributes(attributes, {
      allowEmpty: true,
      exclude: ['href', 'rel'],
    });

    return `<style${serializedAttributes ? ` ${serializedAttributes}` : ''}>${cssBuffer.toString('utf8')}</style>`;
  });
}

function inlineHtmlDocument(html, context) {
  let output = String(html ?? '');

  output = inlineLocalStylesheets(output, context);
  output = inlineLocalScripts(output, context);

  for (const spec of [
    { tag: 'img', attribute: 'src' },
    { tag: 'audio', attribute: 'src' },
    { tag: 'video', attribute: 'src' },
    { tag: 'source', attribute: 'src' },
  ]) {
    output = inlineLocalAttributeReference(output, spec, context);
  }

  output = inlineGifPlayerDataSource(output, context);
  output = inlineLocalIframes(output, context);

  return output;
}

function inlineIframeSource(resolvedPath, context) {
  const normalizedPath = resolve(resolvedPath);

  if (context.visitedHtml.has(normalizedPath)) {
    context.onWarning?.(`skipping recursive iframe asset "${normalizedPath}".`);
    return null;
  }

  const htmlBuffer = readAsset(normalizedPath, context);
  if (!htmlBuffer) return null;

  context.visitedHtml.add(normalizedPath);

  try {
    return inlineHtmlDocument(htmlBuffer.toString('utf8'), {
      ...context,
      basePath: normalizedPath,
    });
  } finally {
    context.visitedHtml.delete(normalizedPath);
  }
}

function inlineLocalIframes(html, context) {
  return String(html ?? '').replace(/<iframe\b([^>]*)><\/iframe>/giu, (match, rawAttributes) => {
    const attributes = parseHtmlAttributes(rawAttributes);
    const source = attributes.src ?? '';

    if (!isLocalRelativeReference(source)) return match;

    const resolvedPath = resolveLocalReference(source, context.basePath);
    const extension = extname(stripUrlSuffix(source)).toLowerCase();
    if (!['.html', '.htm'].includes(extension)) {
      context.onWarning?.(`standalone mode left iframe "${source}" unchanged because only local HTML iframes are supported.`);
      return match;
    }

    const srcdoc = inlineIframeSource(resolvedPath, context);
    if (!srcdoc) return match;

    delete attributes.src;
    attributes.srcdoc = srcdoc;

    const serializedAttributes = serializeAttributes(attributes, { allowEmpty: true });
    return `<iframe${serializedAttributes ? ` ${serializedAttributes}` : ''}></iframe>`;
  });
}

export default function inlineStandaloneAssets(html, options = {}) {
  const basePath = options.outputPath ?? options.markdownPath;
  if (typeof basePath !== 'string' || basePath === '') return String(html ?? '');

  const context = {
    basePath,
    onWarning: options.onWarning,
    visitedHtml: new Set(),
  };

  return inlineHtmlDocument(html, context);
}
