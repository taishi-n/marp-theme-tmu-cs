import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const attributeSpecs = {
  audio: ['src'], embed: ['src'], iframe: ['src'], image: ['href', 'xlink:href'],
  img: ['src'], input: ['src'], link: ['href'], object: ['data'], script: ['src'],
  source: ['src'], use: ['href', 'xlink:href'], video: ['src', 'poster'],
};

export function resourceAttributes(node) {
  const names = new Set([...(attributeSpecs[node.tagName] ?? []), 'data-gif-src']);
  return (node.attrs ?? []).filter((attr) => names.has(attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name));
}

export function isEmbeddedReference(value) {
  return /^(?:data:|#)/iu.test(String(value ?? '').trim());
}

export function resolveResourceUrl(reference, basePath) {
  const base = basePath instanceof URL ? basePath : /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(basePath)
    ? new URL(basePath) : pathToFileURL(resolve(basePath));
  return new URL(reference, String(reference).startsWith('//') && base.protocol === 'file:' ? 'https://localhost/' : base);
}

export function cssResourceReferences(css) {
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/giu;
  return [...String(css ?? '').matchAll(pattern)].map((match) => ({
    reference: (match[2] ?? match[4]).trim(),
    start: match.index, end: match.index + match[0].length,
    import: match[4] !== undefined,
  }));
}

export function nodeResourceReferences(node) {
  const references = resourceAttributes(node).map((attr) => attr.value);
  const srcset = node.attrs?.find((attr) => attr.name === 'srcset')?.value;
  references.push(...parseSrcsetCandidates(srcset).map(({ url }) => url));
  const css = node.tagName === 'style' ? (node.childNodes ?? []).map((child) => child.value ?? '').join('')
    : node.attrs?.find((attr) => attr.name === 'style')?.value;
  references.push(...cssResourceReferences(css).map(({ reference }) => reference));
  return references.filter(Boolean);
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
