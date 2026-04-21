import { asNonEmptyString, hasOwn, normalizeText, parseFrontMatter } from '../core/front-matter.mjs';

function getDeckMetadata(frontMatter) {
  return {
    affiliation: asNonEmptyString(frontMatter.affiliation),
    author: asNonEmptyString(frontMatter.author),
    date: asNonEmptyString(frontMatter.date),
    subtitle: asNonEmptyString(frontMatter.subtitle) ?? asNonEmptyString(frontMatter.description),
    title: asNonEmptyString(frontMatter.title),
  };
}

function getFirstSlide(markdown) {
  const separator = /^\s*---\s*$/m.exec(markdown);
  return separator ? markdown.slice(0, separator.index) : markdown;
}

function firstSlideHasTitleClass(markdown) {
  return /\btitle-slide\b/.test(getFirstSlide(markdown));
}

function firstSlideLooksLikeTitleSlide(markdown, metadata) {
  if (!metadata.title) return false;

  const significantLines = getFirstSlide(markdown)
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (significantLines.length === 0) return false;
  if (!significantLines[0].startsWith('# ')) return false;
  if (normalizeText(significantLines[0].slice(2)) !== normalizeText(metadata.title)) return false;

  const rest = significantLines.slice(1);
  if (rest.length > 4) return false;
  if (rest.some((line) => /^[-*+]\s/.test(line) || /^\d+\.\s/.test(line) || /^```/.test(line))) return false;

  return true;
}

function isFalseLike(value) {
  return value === false || value === 'false' || value === '0';
}

function buildDefaultMarginals(frontMatter, metadata) {
  const directives = [];

  if (!hasOwn(frontMatter, 'header')) {
    const header = [metadata.title, metadata.subtitle].filter(Boolean).join(' / ');
    if (header) directives.push(`header: ${JSON.stringify(header)}`);
  }

  if (!hasOwn(frontMatter, 'footer')) {
    const footer = [metadata.author, metadata.date].filter(Boolean).join(' / ');
    if (footer) directives.push(`footer: ${JSON.stringify(footer)}`);
  }

  if (directives.length === 0) return '';
  return `<!--\n${directives.join('\n')}\n-->\n\n`;
}

function buildTitleSlide(frontMatter, metadata, body) {
  if (!metadata.title || isFalseLike(frontMatter.titleSlide)) {
    return { body, prefix: '' };
  }

  if (firstSlideHasTitleClass(body)) {
    return { body, prefix: '' };
  }

  if (firstSlideLooksLikeTitleSlide(body, metadata)) {
    return { body, prefix: '<!-- _class: title-slide -->\n\n' };
  }

  const lines = ['<!-- _class: title-slide -->', '', `# ${metadata.title}`];

  if (metadata.subtitle) lines.push('', `## ${metadata.subtitle}`);
  if (metadata.author) lines.push('', `### ${metadata.author}`);
  if (metadata.affiliation) lines.push('', `#### ${metadata.affiliation}`);
  if (metadata.date) lines.push('', `#### ${metadata.date}`);

  const titleSlide = `${lines.join('\n')}\n`;
  const trimmedBody = body.trimStart();

  if (trimmedBody === '') {
    return { body: titleSlide, prefix: '' };
  }

  return {
    body: `${titleSlide}\n---\n\n${trimmedBody}`,
    prefix: '',
  };
}

export default function applyDeckDefaults(markdown) {
  const { body, data: frontMatter, frontMatter: rawFrontMatter } = parseFrontMatter(markdown);
  const metadata = getDeckMetadata(frontMatter);
  const marginalDirectives = buildDefaultMarginals(frontMatter, metadata);
  const { body: bodyWithTitleSlide, prefix } = buildTitleSlide(frontMatter, metadata, body);

  return {
    frontMatter,
    markdown: `${rawFrontMatter}${marginalDirectives}${prefix}${bodyWithTitleSlide}`,
  };
}
