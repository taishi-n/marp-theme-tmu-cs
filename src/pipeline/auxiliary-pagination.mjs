function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function escapeHtmlAttribute(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function hasClass(sectionHtml, className) {
  const match = sectionHtml.match(/\bclass="([^"]*)"/u);
  return typeof match?.[1] === 'string' && match[1].split(/\s+/u).includes(className);
}

function mergeClasses(rawValue, classNames) {
  const merged = new Set(
    String(rawValue ?? '')
      .split(/\s+/u)
      .map((className) => className.trim())
      .filter(Boolean),
  );

  for (const className of classNames) merged.add(className);
  return Array.from(merged).join(' ');
}

function updateAttribute(tag, name, value) {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}="[^"]*"`, 'u');
  if (pattern.test(tag)) {
    return tag.replace(pattern, ` ${name}="${value}"`);
  }

  return tag.replace(/^<section\b/u, `<section ${name}="${value}"`);
}

function markerClassesToSlideClasses(classAttr) {
  return String(classAttr ?? '')
    .split(/\s+/u)
    .filter((className) => className.startsWith('tmu-cs-slide-class--'))
    .map((className) => className.slice('tmu-cs-slide-class--'.length))
    .filter(Boolean);
}

function promoteMarkedSlideClasses(sectionHtml) {
  const markerPattern = /<span class="([^"]*\btmu-cs-slide-class--[^\s"]+[^"]*)"><\/span>\s*/gu;
  const markerMatches = Array.from(sectionHtml.matchAll(markerPattern));
  if (markerMatches.length === 0) return sectionHtml;

  const classNames = markerMatches.flatMap((match) => markerClassesToSlideClasses(match[1]));
  const openingTagMatch = sectionHtml.match(/^<section\b[^>]*>/u);
  if (!openingTagMatch) return sectionHtml;

  let openingTag = openingTagMatch[0];
  const existingClassMatch = openingTag.match(/\bclass="([^"]*)"/u);
  openingTag = updateAttribute(openingTag, 'class', mergeClasses(existingClassMatch?.[1], classNames));
  openingTag = updateAttribute(openingTag, 'data-class', mergeClasses(openingTag.match(/\bdata-class="([^"]*)"/u)?.[1], classNames));

  return sectionHtml
    .replace(openingTagMatch[0], openingTag)
    .replace(markerPattern, '')
    .replace(/id="([^"]+)-span-classtmu-cs-slide-class--[^"]*"/gu, 'id="$1"');
}

function extractFirstHeadingText(sectionHtml) {
  const match = sectionHtml.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/u);
  if (!match) return '';

  return match[1]
    .replace(/<[^>]+>/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function updateHeaderSectionName(sectionHtml, sectionName) {
  if (!sectionName) return sectionHtml;

  const headerMatch = sectionHtml.match(/<header\b[^>]*>/u);
  if (!headerMatch) return sectionHtml;

  const nextHeaderTag = headerMatch[0].includes('data-section-name=')
    ? headerMatch[0].replace(/\sdata-section-name="[^"]*"/u, ` data-section-name="${escapeHtmlAttribute(sectionName)}"`)
    : headerMatch[0].replace(/^<header\b/u, `<header data-section-name="${escapeHtmlAttribute(sectionName)}"`);

  return sectionHtml.replace(headerMatch[0], nextHeaderTag);
}

export default function recalculateAuxiliaryPagination(html) {
  const promotedHtml = String(html ?? '').replace(
    /<section\b[\s\S]*?<\/section>/gu,
    (sectionHtml) => promoteMarkedSlideClasses(sectionHtml),
  );
  const sections = Array.from(promotedHtml.matchAll(/<section\b[\s\S]*?<\/section>/gu));
  if (sections.length === 0) return html;

  const visibleSections = sections.filter(([sectionHtml]) => !hasClass(sectionHtml, 'auxiliary-page'));
  const total = String(visibleSections.length);
  let currentPage = 0;
  let currentSectionName = '';

  return sections.reduce((output, match) => {
    const [sectionHtml] = match;
    const openingTagMatch = sectionHtml.match(/^<section\b[^>]*>/u);
    if (!openingTagMatch) return output;

    const openingTag = openingTagMatch[0];
    const auxiliary = hasClass(sectionHtml, 'auxiliary-page');
    const sectionPage = hasClass(sectionHtml, 'section-page');
    if (sectionPage) currentSectionName = extractFirstHeadingText(sectionHtml);
    if (!auxiliary) currentPage += 1;

    let nextOpeningTag = updateAttribute(
      updateAttribute(openingTag, 'data-marpit-pagination-total', auxiliary ? '' : total),
      'data-marpit-pagination',
      auxiliary ? '' : String(currentPage),
    );

    if (auxiliary) {
      nextOpeningTag = updateAttribute(nextOpeningTag, 'data-paginate', 'false');
    }

    let nextSectionHtml = output.replace(openingTag, nextOpeningTag);
    if (!auxiliary && !hasClass(sectionHtml, 'title-slide')) {
      nextSectionHtml = nextSectionHtml.replace(sectionHtml.replace(openingTag, nextOpeningTag), updateHeaderSectionName(sectionHtml.replace(openingTag, nextOpeningTag), currentSectionName));
    }

    return nextSectionHtml;
  }, promotedHtml);
}
