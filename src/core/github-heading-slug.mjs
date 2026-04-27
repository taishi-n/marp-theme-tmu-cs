function stripHtmlTags(value) {
  return String(value ?? '').replace(/<[^>]+>/gu, '');
}

function stripMarkdownLinks(value) {
  return String(value ?? '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/gu, '$1');
}

export function stripMarkdownHeadingFormatting(value) {
  return stripHtmlTags(stripMarkdownLinks(value))
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/[*_~]/gu, '')
    .replace(/\\([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~-])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function slugifyGitHubHeading(value) {
  return stripMarkdownHeadingFormatting(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s-]/gu, '')
    .replace(/\s+/gu, '-');
}

export function createGitHubHeadingSlugger() {
  const counts = new Map();

  return {
    slug(value) {
      const base = slugifyGitHubHeading(value);
      const currentCount = counts.get(base) ?? 0;
      counts.set(base, currentCount + 1);
      return currentCount === 0 ? base : `${base}-${currentCount}`;
    },
  };
}
