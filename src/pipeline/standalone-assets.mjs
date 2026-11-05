import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { parse, parseFragment, serialize, serializeOuter } from 'parse5';
import { resolveConstrainedFilePath, resolveInputRoot } from '../core/local-path.mjs';

const mimeTypes = new Map([
  ['.css', 'text/css'],
  ['.gif', 'image/gif'],
  ['.htm', 'text/html'],
  ['.html', 'text/html'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript'],
  ['.mjs', 'text/javascript'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.otf', 'font/otf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function parseHtml(html) {
  return /<(?:!doctype\s+html|html)\b/iu.test(html) ? parse(html) : parseFragment(html);
}

function getAttribute(node, name) {
  return node?.attrs?.find((attribute) => attribute.name === name)?.value;
}

function setAttribute(node, name, value) {
  node.attrs ??= [];
  const attribute = node.attrs.find((candidate) => candidate.name === name);
  if (attribute) attribute.value = String(value);
  else node.attrs.push({ name, value: String(value) });
}

function removeAttribute(node, name) {
  node.attrs = (node.attrs ?? []).filter((attribute) => attribute.name !== name);
}

function hasClass(node, className) {
  return String(getAttribute(node, 'class') ?? '').split(/\s+/u).includes(className);
}

function walk(node, visit) {
  visit(node);
  for (const child of [...(node?.childNodes ?? [])]) walk(child, visit);
}

function stripUrlSuffix(value = '') {
  return String(value ?? '').replace(/[?#].*$/u, '');
}

function isRemoteReference(reference) {
  return /^https?:\/\//iu.test(String(reference ?? '').trim());
}

function isLocalReference(reference) {
  const value = String(reference ?? '').trim();
  if (value === '' || value.startsWith('#') || value.startsWith('data:') || value.startsWith('blob:')) return false;
  if (value.startsWith('//') || isAbsolute(value)) return false;
  return !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);
}

function detectMimeType(reference, supplied = '') {
  if (supplied) return supplied.split(';', 1)[0];
  return mimeTypes.get(extname(stripUrlSuffix(reference)).toLowerCase()) ?? 'application/octet-stream';
}

function toDataUrl(reference, asset) {
  const buffer = Buffer.isBuffer(asset.buffer) ? asset.buffer : Buffer.from(asset.buffer ?? '');
  return `data:${detectMimeType(reference, asset.mimeType)};base64,${buffer.toString('base64')}`;
}

function fetchRemoteAssetSync(reference, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const maximumRedirects = options.maximumRedirects ?? 5;
  const script = `
    const startUrl = process.argv[1];
    const timeoutMs = Number(process.argv[2]);
    const maximumRedirects = Number(process.argv[3]);
    let currentUrl = startUrl;

    for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await fetch(currentUrl, {
        headers: {
          Accept: '*/*',
          'User-Agent': 'marp-theme-tmu-cs standalone fetch',
        },
        redirect: 'manual',
        signal,
      });

      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        if (redirects === maximumRedirects) throw new Error('redirect limit exceeded');
        currentUrl = new URL(response.headers.get('location'), currentUrl).href;
        continue;
      }

      if (!response.ok) throw new Error('status:' + String(response.status));
      const buffer = Buffer.from(await response.arrayBuffer());
      await new Promise((resolve, reject) => {
        process.stdout.write(JSON.stringify({
          buffer: buffer.toString('base64'),
          mimeType: String(response.headers.get('content-type') || '').split(';', 1)[0],
        }), (error) => error ? reject(error) : resolve());
      });
      break;
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script, reference, String(timeoutMs), String(maximumRedirects)],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: timeoutMs + 1000 },
  );

  if (result.error || result.status !== 0) {
    const detail = result.error?.message || String(result.stderr ?? '').trim() || `status:${result.status ?? 1}`;
    throw new Error(`failed to fetch remote asset "${reference}". ${detail}`);
  }

  try {
    const payload = JSON.parse(String(result.stdout ?? ''));
    return {
      buffer: Buffer.from(String(payload.buffer ?? ''), 'base64'),
      mimeType: String(payload.mimeType ?? ''),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to decode remote asset "${reference}". ${detail}`, { cause: error });
  }
}

function resolveReference(reference, basePath) {
  if (isRemoteReference(reference)) return { key: reference, kind: 'remote', reference };
  if (!isLocalReference(reference)) return undefined;

  if (isRemoteReference(basePath)) {
    const remoteReference = new URL(reference, basePath).href;
    return { key: remoteReference, kind: 'remote', reference: remoteReference };
  }

  const filePath = resolve(dirname(basePath), stripUrlSuffix(reference));
  return { filePath, key: filePath, kind: 'local', reference };
}

function loadAsset(reference, context, basePath = context.basePath) {
  const resolvedReference = resolveReference(reference, basePath);
  if (!resolvedReference) return undefined;

  if (context.assetCache.has(resolvedReference.key)) return context.assetCache.get(resolvedReference.key);

  let asset;
  try {
    if (resolvedReference.kind === 'remote') {
      asset = context.fetchRemoteAsset(resolvedReference.reference, context);
      if (!asset) throw new Error('the fetcher returned no asset');
    } else {
      const filePath = resolveConstrainedFilePath(resolvedReference.filePath, {
        allowOutsideRoot: context.allowLocalFiles,
        inputRoot: context.inputRoot,
      });
      asset = {
        buffer: readFileSync(filePath),
        mimeType: detectMimeType(filePath),
      };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[tmu-cs] standalone mode could not embed "${reference}". ${detail}`, { cause: error });
  }

  context.assetCache.set(resolvedReference.key, asset);
  return asset;
}

function resolveNestedBase(reference, basePath) {
  if (isRemoteReference(reference)) return reference;
  if (isRemoteReference(basePath)) return new URL(reference, basePath).href;
  return resolve(dirname(basePath), stripUrlSuffix(reference));
}

function inlineCssReferences(css, context, basePath, embedRemote = true, imports = new Set()) {
  return String(css ?? '').replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/giu, (match, _quote, reference) => {
    const trimmed = reference.trim();
    if (!embedRemote && isRemoteReference(trimmed)) return match;
    const asset = loadAsset(trimmed, context, basePath);
    if (!asset) return match;
    if (detectMimeType(trimmed, asset.mimeType) === 'text/css') {
      const nestedBase = resolveNestedBase(trimmed, basePath);
      if (imports.has(nestedBase)) {
        throw new Error(`[tmu-cs] standalone mode found a circular CSS import: "${trimmed}".`);
      }
      const nestedCss = inlineCssReferences(asset.buffer.toString('utf8'), context, nestedBase,
        embedRemote, new Set([...imports, nestedBase]));
      return `url("${toDataUrl(trimmed, { ...asset, buffer: Buffer.from(nestedCss) })}")`;
    }
    return `url("${toDataUrl(trimmed, asset)}")`;
  });
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
  if (isRemoteReference(source) || isRemoteReference(basePath)) {
    throw new Error(`[tmu-cs] standalone mode cannot embed remote iframe "${source}".`);
  }
  if (!isLocalReference(source) || !/\.html?$/iu.test(stripUrlSuffix(source))) {
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
  const asset = loadAsset(reference, context, basePath);
  if (asset) setAttribute(node, attributeName, toDataUrl(reference, node.tagName === 'img' ? withIntrinsicSvgDimensions(asset) : asset));
}

export function parseSrcsetCandidates(srcset) {
  const source = String(srcset ?? '');
  const candidates = [];
  let cursor = 0;

  while (cursor < source.length) {
    while (cursor < source.length && /[\s,]/u.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) break;

    const urlStart = cursor;
    while (cursor < source.length && !/\s/u.test(source[cursor])) cursor += 1;
    let url = source.slice(urlStart, cursor);

    if (url.endsWith(',')) {
      url = url.replace(/,+$/u, '');
      if (url) candidates.push({ descriptor: '', url });
      continue;
    }

    while (cursor < source.length && /\s/u.test(source[cursor])) cursor += 1;
    const descriptorStart = cursor;
    let parenthesisDepth = 0;

    while (cursor < source.length) {
      const character = source[cursor];
      if (character === '(') parenthesisDepth += 1;
      if (character === ')') parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      if (character === ',' && parenthesisDepth === 0) break;
      cursor += 1;
    }

    const descriptor = source.slice(descriptorStart, cursor).trim();
    if (cursor < source.length && source[cursor] === ',') cursor += 1;
    candidates.push({ descriptor, url });
  }

  return candidates;
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

function isEmbeddedReference(value) {
  return /^(?:data:|#)/u.test(String(value ?? '').trim());
}

function assertStandaloneDocument(document) {
  const unresolved = [];
  const attributeSpecs = {
    audio: ['src'],
    embed: ['src'],
    image: ['href', 'xlink:href'],
    img: ['src'],
    input: ['src'],
    object: ['data'],
    source: ['src'],
    video: ['src', 'poster'],
  };

  walk(document, (node) => {
    if (!node?.tagName) return;
    const scriptSource = getAttribute(node, 'src');
    if (node.tagName === 'script' && scriptSource && !isEmbeddedReference(scriptSource)) {
      unresolved.push(`script src="${scriptSource}"`);
    }
    const iframeSource = getAttribute(node, 'src');
    if (node.tagName === 'iframe' && iframeSource && !isEmbeddedReference(iframeSource)) {
      unresolved.push(`iframe src="${iframeSource}"`);
    }
    const linkTarget = getAttribute(node, 'href');
    if (node.tagName === 'link' && linkTarget && !isEmbeddedReference(linkTarget)) {
      unresolved.push(`link href="${linkTarget}"`);
    }
    const srcset = getAttribute(node, 'srcset');
    for (const { url } of parseSrcsetCandidates(srcset)) {
      if (!isEmbeddedReference(url)) unresolved.push(`${node.tagName} srcset="${url}"`);
    }

    for (const attributeName of attributeSpecs[node.tagName] ?? []) {
      const value = getAttribute(node, attributeName);
      if (value && !isEmbeddedReference(value)) {
        unresolved.push(`${node.tagName} ${attributeName}="${value}"`);
      }
    }

    const style = node.tagName === 'style'
      ? (node.childNodes ?? []).map((child) => child.value ?? '').join('')
      : getAttribute(node, 'style');
    for (const match of String(style ?? '').matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/giu)) {
      const value = match[2].trim();
      if (!isEmbeddedReference(value)) unresolved.push(`${node.tagName} style url("${value}")`);
    }
    for (const match of String(style ?? '').matchAll(/@import\s+(['"])([^'"]+)\1/giu)) {
      unresolved.push(`${node.tagName} style @import "${match[2]}"`);
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
    if (node.tagName === 'iframe' && getAttribute(node, 'src')) {
      inlineIframe(node, context, basePath);
      return;
    }

    const attributeSpecs = {
      audio: ['src'],
      embed: ['src'],
      image: ['href', 'xlink:href'],
      img: ['src'],
      input: ['src'],
      object: ['data'],
      source: ['src'],
      video: ['src', 'poster'],
    };
    for (const attributeName of attributeSpecs[node.tagName] ?? []) {
      inlineUrlAttribute(node, attributeName, context, basePath);
    }
    if (getAttribute(node, 'srcset')) inlineSrcset(node, context, basePath);

    if (node.tagName === 'span' && hasClass(node, 'tmu-cs-gif-player')) {
      inlineUrlAttribute(node, 'data-gif-src', context, basePath);
    }

    const style = getAttribute(node, 'style');
    if (style) setAttribute(node, 'style', inlineCssReferences(style, context, basePath));
  });

  assertStandaloneDocument(document);
  return serialize(document);
}

function createAssetContext(basePath, options) {
  return {
    allowLocalFiles: options.allowLocalFiles === true,
    assetCache: new Map(),
    basePath,
    fetchRemoteAsset: options.fetchRemoteAsset ?? ((reference) => fetchRemoteAssetSync(reference, options)),
    inputRoot: resolveInputRoot(basePath),
    visitedHtml: new Set([resolve(basePath)]),
  };
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
