import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConstrainedFilePath, resolveInputRoot } from '../core/local-path.mjs';
import { isEmbeddedReference, resolveResourceUrl } from '../core/html-resources.mjs';

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

function stripUrlSuffix(value = '') {
  return String(value ?? '').replace(/[?#].*$/u, '');
}

export function detectMimeType(reference, supplied = '') {
  if (supplied) return supplied.split(';', 1)[0];
  return mimeTypes.get(extname(stripUrlSuffix(reference)).toLowerCase()) ?? 'application/octet-stream';
}

export function toDataUrl(reference, asset) {
  const buffer = Buffer.isBuffer(asset.buffer) ? asset.buffer : Buffer.from(asset.buffer ?? '');
  return `data:${detectMimeType(reference, asset.mimeType)};base64,${buffer.toString('base64')}${String(reference).match(/#.*$/u)?.[0] ?? ''}`;
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

export function resolveReference(reference, basePath) {
  if (!reference || isEmbeddedReference(reference)) return undefined;
  const url = resolveResourceUrl(reference, basePath);
  url.hash = '';
  if (['http:', 'https:'].includes(url.protocol)) return { key: url.href, kind: 'remote', reference: url.href };
  if (url.protocol !== 'file:') return undefined;
  const filePath = fileURLToPath(url);
  return { filePath, key: filePath, kind: 'local', reference };
}

export function loadAsset(reference, context, basePath = context.basePath) {
  const resolvedReference = resolveReference(reference, basePath);
  if (!resolvedReference) return undefined;

  let asset;
  try {
    if (resolvedReference.kind === 'local') {
      resolvedReference.filePath = resolveConstrainedFilePath(resolvedReference.filePath, {
        allowOutsideRoot: context.allowLocalFiles, inputRoot: context.inputRoot,
      });
      resolvedReference.key = resolvedReference.filePath;
    }
    if (context.assetCache.has(resolvedReference.key)) return context.assetCache.get(resolvedReference.key);
    if (resolvedReference.kind === 'remote') {
      asset = context.fetchRemoteAsset(resolvedReference.reference, context);
      if (!asset) throw new Error('the fetcher returned no asset');
    } else {
      const filePath = resolvedReference.filePath;
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

export function resolveNestedBase(reference, basePath) {
  const url = resolveResourceUrl(reference, basePath);
  return url.protocol === 'file:' ? fileURLToPath(url) : url.href;
}

export function createAssetContext(basePath, options = {}) {
  return {
    allowLocalFiles: options.allowLocalFiles === true,
    assetCache: options.assetCache ?? new Map(),
    basePath,
    fetchRemoteAsset: options.fetchRemoteAsset ?? ((reference) => fetchRemoteAssetSync(reference, options)),
    inputRoot: resolveInputRoot(basePath),
    visitedHtml: new Set([resolve(basePath)]),
  };
}
