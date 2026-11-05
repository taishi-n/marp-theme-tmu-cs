import { parse, parseFragment, serializeOuter } from 'parse5';
import { replaceHtmlRanges } from '../core/html.mjs';
import { readSlideSource } from '../core/slide-source.mjs';

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
      html: serializeOuter(section),
      start: section.sourceCodeLocation?.startOffset,
    }))
    .filter(({ end, start }) => Number.isInteger(start) && Number.isInteger(end));

  return replaceHtmlRanges(html, replacements);
}

// Consume generated markers before Core derives heading IDs. Keep these as
// token metadata so neither the markers nor their class names affect the slug.
export function installSlideMetadata(marp) {
  marp.markdown.core.ruler.before('marpit_directives_apply', 'tmu_cs_slide_metadata', (state) => {
    if (state.inlineMode) return;
    let slide;
    let heading;
    let skipParagraphClose = false;
    const retained = [];
    for (const token of state.tokens) {
      if (token.type === 'marpit_slide_open') slide = token;
      if (skipParagraphClose && token.type === 'paragraph_close') {
        skipParagraphClose = false;
        continue;
      }
      if (slide && ['html_block', 'inline'].includes(token.type)) {
        const source = readSlideSource(token.content);
        if (source) {
          slide.attrSet('data-source-id', source.id);
          slide.attrSet('data-source-line', String(source.sourceLine));
          slide.attrSet('data-source-slide', String(source.sourceSlide));
          if (token.type === 'inline' && retained.at(-1)?.type === 'paragraph_open') {
            retained.pop();
            skipParagraphClose = true;
          }
          continue;
        }
      }
      if (token.type === 'heading_open') heading = token;
      if (slide && token.type === 'inline') {
        const children = token.children ?? [];
        token.children = children.filter((child, index) => {
          if (child.type !== 'html_inline') return true;
          const previous = children[index - 1];
          if (child.content === '</span>' && previous?.meta?.tmuMarker) return false;
          if (children[index + 1]?.content !== '</span>') return true;
          const classes = child.content.match(/^<span class="(tmu-cs-slide-class--[^"<>]+)">$/u);
          const target = child.content.match(/^<span data-tmu-cs-heading="(\d+)">$/u);
          if (!classes && !(target && heading)) return true;
          child.meta = { ...child.meta, tmuMarker: true };
          if (classes) {
            const directives = slide.meta.marpitDirectives;
            directives.class = [...new Set([
              ...String(directives.class ?? '').split(/\s+/u).filter(Boolean),
              ...classes[1].split(/\s+/u).map((name) => name.replace(/^tmu-cs-slide-class--/u, '')),
            ])].join(' ');
          }
          if (target && heading) heading.meta = { ...heading.meta, tmuTocTarget: target[1] };
          return false;
        });
      }
      if (token.type === 'heading_close') heading = undefined;
      if (token.type === 'marpit_slide_close') {
        if (String(slide.meta.marpitDirectives.class ?? '').split(/\s+/u).includes('auxiliary-page')) {
          slide.meta.marpitDirectives.paginate = 'skip';
        }
        slide = undefined;
      }
      retained.push(token);
    }
    state.tokens = retained;
  });

  marp.markdown.core.ruler.after('marp_slug', 'tmu_cs_toc_links', (state) => {
    if (state.inlineMode) return;
    const targets = new Map();
    let slideId;
    for (const token of state.tokens) {
      if (token.type === 'marpit_slide_open') slideId = token.attrGet('id');
      const target = token.meta?.tmuTocTarget;
      // A step-expanded heading can occur repeatedly. Link to its first state.
      if (target !== undefined && !targets.has(target)) {
        targets.set(target, token.attrGet('id') ?? slideId);
      }
    }
    for (const token of state.tokens) {
      for (const child of token.children ?? []) {
        if (child.type !== 'link_open') continue;
        const target = child.attrGet('href')?.match(/^#tmu-cs-toc-(\d+)$/u)?.[1];
        if (target !== undefined && targets.get(target)) child.attrSet('href', `#${targets.get(target)}`);
      }
    }
  });
}

export default function decorateAuxiliarySlides(html, options = {}) {
  const source = String(html ?? '');
  const document = parseHtml(source);
  const sections = [];

  walk(document, (node, context) => {
    if (context.outerSection) sections.push(node);
  });
  if (sections.length === 0) return source;

  let currentSectionName = '';
  const occurrences = new Map();
  const slides = [];

  for (const [offset, section] of sections.entries()) {
    const auxiliary = hasClass(section, 'auxiliary-page');
    if (hasClass(section, 'section-page')) currentSectionName = firstHeadingText(section);
    if (!auxiliary && !hasClass(section, 'title-slide')) {
      updateHeaderSectionName(section, currentSectionName);
    }
    const kind = hasClass(section, 'title-slide') ? 'title' : hasClass(section, 'section-page') ? 'section' : hasClass(section, 'toc-page') ? 'toc' : 'content';
    const sourceId = getAttribute(section, 'data-source-id') ?? (kind === 'title' ? '@title' : `@generated-${offset + 1}`);
    const group = `${sourceId}:${kind}`;
    const occurrence = (occurrences.get(group) ?? 0) + 1;
    occurrences.set(group, occurrence);
    const id = `${sourceId}${kind === 'section' ? '@section' : ''}${occurrence > 1 ? `@${occurrence}` : ''}`;
    setAttribute(section, 'data-slide-id', id);
    if (options.editLabels) {
      const label = parseFragment('<span class="tmu-cs-edit-label" aria-hidden="true"></span>').childNodes[0];
      if (!('childNodes' in label)) throw new Error('[tmu-cs] could not create the edit label.');
      label.childNodes = [{ nodeName: '#text', value: id, parentNode: label }];
      label.parentNode = section;
      section.childNodes.push(label);
    }
    slides.push({
      id, sourceId,
      sourceLine: Number(getAttribute(section, 'data-source-line')) || null,
      sourceSlide: Number(getAttribute(section, 'data-source-slide')) || null,
      physicalPage: offset + 1,
      number: Number(getAttribute(section, 'data-marpit-pagination')) || null,
      total: Number(getAttribute(section, 'data-marpit-pagination-total')) || null,
      kind, state: occurrence, title: firstHeadingText(section), section: currentSectionName,
    });
  }

  options.onSlides?.(slides);

  return replaceOuterSections(source, sections);
}
