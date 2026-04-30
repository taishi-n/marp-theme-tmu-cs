import { spawnSync } from 'node:child_process';
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

function isRemoteHttpReference(reference = '') {
  return /^https?:\/\//iu.test(String(reference ?? '').trim());
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

function detectRemoteMimeType(reference = '', fallbackMimeType = '') {
  const extension = extname(stripUrlSuffix(reference)).toLowerCase();
  return fallbackMimeType || binaryMimeTypes.get(extension) || textMimeTypes.get(extension) || 'application/octet-stream';
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

function toRemoteDataUrl(reference, fetchedAsset = {}) {
  const buffer = Buffer.isBuffer(fetchedAsset.buffer)
    ? fetchedAsset.buffer
    : Buffer.from(fetchedAsset.buffer ?? '');
  const mimeType = detectRemoteMimeType(reference, fetchedAsset.mimeType);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function isKrokiDiagramReference(reference = '') {
  return /^https?:\/\/kroki\.io\/[^/]+\/svg\/[^/?#]+$/iu.test(String(reference ?? '').trim());
}

function fetchRemoteAssetSync(reference, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const script = `
    import { request as httpRequest } from 'node:http';
    import { request as httpsRequest } from 'node:https';

    const reference = process.argv[1];
    const timeoutMs = Number.parseInt(process.argv[2] || '', 10) || 10000;
    const target = new URL(reference);
    const requestImpl = target.protocol === 'http:' ? httpRequest : httpsRequest;

    const fail = (message) => {
      process.stderr.write(String(message));
      process.exit(1);
    };

    const request = requestImpl(target, {
      headers: {
        Accept: 'image/svg+xml,image/*;q=0.8,*/*;q=0.5',
        'User-Agent': 'marp-theme-tmu-cs standalone fetch',
      },
      method: 'GET',
      timeout: timeoutMs,
    }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        process.stdout.write(JSON.stringify({
          redirect: response.headers.location,
        }));
        response.resume();
        response.on('end', () => process.exit(0));
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        fail('status:' + String(response.statusCode ?? 0));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        process.stdout.write(JSON.stringify({
          buffer: Buffer.concat(chunks).toString('base64'),
          mimeType: String(response.headers['content-type'] || '').split(';', 1)[0] || '',
        }));
        process.exit(0);
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });

    request.on('error', (error) => {
      fail(error instanceof Error ? error.message : String(error));
    });

    request.end();
  `;

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, reference, String(timeoutMs)], {
    encoding: 'utf8',
    timeout: timeoutMs + 1000,
  });

  if (result.error) {
    const message = result.error instanceof Error ? result.error.message : String(result.error);
    options.onWarning?.(`failed to fetch remote asset "${reference}". ${message}`);
    return null;
  }

  if ((result.status ?? 0) !== 0) {
    const message = String(result.stderr ?? '').trim() || `status:${result.status ?? 1}`;
    options.onWarning?.(`failed to fetch remote asset "${reference}". ${message}`);
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(String(result.stdout ?? '').trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.onWarning?.(`failed to decode remote asset "${reference}". ${message}`);
    return null;
  }

  if (typeof payload.redirect === 'string' && payload.redirect !== '') {
    return fetchRemoteAssetSync(payload.redirect, options);
  }

  return {
    buffer: Buffer.from(String(payload.buffer ?? ''), 'base64'),
    mimeType: String(payload.mimeType ?? ''),
  };
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

function inlineStandaloneDiagramReference(html, context) {
  return String(html ?? '').replace(/<img\b([^>]*)>/giu, (match, rawAttributes) => {
    const attributes = parseHtmlAttributes(rawAttributes);
    const source = attributes.src ?? '';

    if (!isKrokiDiagramReference(source)) return match;

    const fetchedAsset = context.fetchRemoteAsset?.(source, context);
    if (!fetchedAsset) return match;

    attributes.src = toRemoteDataUrl(source, fetchedAsset);
    const serializedAttributes = serializeAttributes(attributes, { allowEmpty: true });
    return `<img${serializedAttributes ? ` ${serializedAttributes}` : ''}>`;
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

  output = inlineStandaloneDiagramReference(output, context);
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
    fetchRemoteAsset: options.fetchRemoteAsset ?? ((reference, fetchContext) => {
      if (!isRemoteHttpReference(reference)) return null;
      return fetchRemoteAssetSync(reference, fetchContext);
    }),
    onWarning: options.onWarning,
    visitedHtml: new Set(),
  };

  return inlineHtmlDocument(html, context);
}
