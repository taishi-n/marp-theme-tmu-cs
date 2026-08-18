import { parse, parseFragment, serializeOuter } from 'parse5';

function parseHtml(html) {
  const options = { sourceCodeLocationInfo: true };
  return /<(?:!doctype\s+html|html)\b/iu.test(html)
    ? parse(html, options)
    : parseFragment(html, options);
}

function walk(node, visit, sectionAncestor = false) {
  const isSection = node?.tagName === 'section';
  visit(node, { outerSection: isSection && !sectionAncestor });

  for (const child of node?.childNodes ?? []) {
    walk(child, visit, sectionAncestor || isSection);
  }
}

function getAttribute(node, name) {
  return node?.attrs?.find((attribute) => attribute.name === name)?.value;
}

function setAttribute(node, name, value) {
  node.attrs ??= [];
  const existing = node.attrs.find((attribute) => attribute.name === name);
  if (existing) existing.value = String(value);
  else node.attrs.push({ name, value: String(value) });
}

function classTokens(node) {
  return String(getAttribute(node, 'class') ?? '').split(/\s+/u).filter(Boolean);
}

function hasClass(node, className) {
  return classTokens(node).includes(className);
}

function mergeClasses(node, names) {
  const merged = new Set([...classTokens(node), ...names].filter(Boolean));
  setAttribute(node, 'class', Array.from(merged).join(' '));
}

function textContent(node) {
  if (node?.nodeName === '#text') return node.value ?? '';
  return (node?.childNodes ?? []).map(textContent).join('');
}

function findFirst(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node?.childNodes ?? []) {
    const found = findFirst(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function removeNode(node) {
  const siblings = node?.parentNode?.childNodes;
  const index = siblings?.indexOf(node) ?? -1;
  if (index >= 0) siblings.splice(index, 1);
}

function promoteMarkedSlideClasses(section) {
  const markers = [];
  walk(section, (node) => {
    if (node?.tagName !== 'span') return;
    const markerClasses = classTokens(node).filter((name) => name.startsWith('tmu-cs-slide-class--'));
    if (markerClasses.length > 0) markers.push({ markerClasses, node });
  });

  const promoted = markers.flatMap(({ markerClasses }) => (
    markerClasses.map((name) => name.slice('tmu-cs-slide-class--'.length)).filter(Boolean)
  ));

  if (promoted.length > 0) {
    mergeClasses(section, promoted);
    const dataClasses = new Set([
      ...String(getAttribute(section, 'data-class') ?? '').split(/\s+/u).filter(Boolean),
      ...promoted,
    ]);
    setAttribute(section, 'data-class', Array.from(dataClasses).join(' '));
  }

  for (const { node } of markers) removeNode(node);

  walk(section, (node) => {
    const id = getAttribute(node, 'id');
    if (id) setAttribute(node, 'id', id.replace(/-span-classtmu-cs-slide-class--.*$/u, ''));
  });
}

function firstHeadingText(section) {
  const heading = findFirst(section, (node) => /^h[1-6]$/u.test(node?.tagName ?? ''));
  return textContent(heading).replace(/\s+/gu, ' ').trim();
}

function updateHeaderSectionName(section, sectionName) {
  if (!sectionName) return;
  const header = findFirst(section, (node) => node?.tagName === 'header');
  if (header) setAttribute(header, 'data-section-name', sectionName);
}

function replaceOuterSections(html, sections) {
  const replacements = sections
    .map((section) => ({
      end: section.sourceCodeLocation?.endOffset,
      replacement: serializeOuter(section),
      start: section.sourceCodeLocation?.startOffset,
    }))
    .filter(({ end, start }) => Number.isInteger(start) && Number.isInteger(end))
    .sort((left, right) => right.start - left.start);

  return replacements.reduce((output, replacement) => (
    `${output.slice(0, replacement.start)}${replacement.replacement}${output.slice(replacement.end)}`
  ), html);
}

export default function recalculateAuxiliaryPagination(html) {
  const source = String(html ?? '');
  const document = parseHtml(source);
  const sections = [];

  walk(document, (node, context) => {
    if (context.outerSection) sections.push(node);
  });
  if (sections.length === 0) return source;

  for (const section of sections) promoteMarkedSlideClasses(section);

  const visibleTotal = sections.filter((section) => !hasClass(section, 'auxiliary-page')).length;
  let currentPage = 0;
  let currentSectionName = '';

  for (const section of sections) {
    const auxiliary = hasClass(section, 'auxiliary-page');
    if (hasClass(section, 'section-page')) currentSectionName = firstHeadingText(section);
    if (!auxiliary) currentPage += 1;

    setAttribute(section, 'data-marpit-pagination-total', auxiliary ? '' : String(visibleTotal));
    setAttribute(section, 'data-marpit-pagination', auxiliary ? '' : String(currentPage));
    if (auxiliary) setAttribute(section, 'data-paginate', 'false');
    if (!auxiliary && !hasClass(section, 'title-slide')) {
      updateHeaderSectionName(section, currentSectionName);
    }
  }

  return replaceOuterSections(source, sections);
}
