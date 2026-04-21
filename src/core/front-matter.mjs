import jsYaml from 'js-yaml';

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
  const match = String(markdown ?? '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    return { body: String(markdown ?? ''), data: {}, frontMatter: '' };
  }

  let data = {};

  try {
    const parsed = load(match[1], { schema: FAILSAFE_SCHEMA });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch {
    data = {};
  }

  return {
    body: String(markdown ?? '').slice(match[0].length),
    data,
    frontMatter: match[0],
  };
}
