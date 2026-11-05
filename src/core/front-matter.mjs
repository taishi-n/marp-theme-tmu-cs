import jsYaml from 'js-yaml';
import { parseMarkdownBlocks } from './markdown-blocks.mjs';

const { FAILSAFE_SCHEMA, load } = jsYaml;

export function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function parseFrontMatter(markdown) {
  const source = String(markdown ?? '');
  const token = parseMarkdownBlocks(source)[0];
  if (token?.type !== 'front_matter') {
    return { body: String(markdown ?? ''), data: {}, frontMatter: '' };
  }
  let end = 0;
  for (let line = 0; line < token.map[1]; line += 1) {
    const newline = source.indexOf('\n', end);
    end = newline === -1 ? source.length : newline + 1;
  }

  let data = {};

  try {
    const parsed = load(token.meta, { schema: FAILSAFE_SCHEMA });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch {
    data = {};
  }

  return {
    body: source.slice(end),
    data,
    frontMatter: source.slice(0, end),
  };
}
