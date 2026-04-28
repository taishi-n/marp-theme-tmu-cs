import { createGitHubHeadingSlugger } from '../core/github-heading-slug.mjs';
import { hasOwn, parseFrontMatter } from '../core/front-matter.mjs';
import { parseMarkdownHeadings } from '../core/headings.mjs';
import { isFenceClose, joinMarkdownSlides, parseFenceStart, splitMarkdownSlides } from '../core/markdown.mjs';
import { splitLinesPreservingEOF } from '../core/text-lines.mjs';

const tocCommandLinePattern = /^<!--\s*toc(?:\s+level\s*=\s*(?<level>\d+))?\s*-->$/u;
const slideClassMarkerPattern = /<span class="([^"]*\btmu-cs-slide-class--[^\s"]+[^"]*)"><\/span>/u;

function isFalseLike(value) {
  return value === false || value === 'false' || value === '0';
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeHeadingKey(value) {
  return String(value ?? '').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function hasClass(classAttr, className) {
  return typeof classAttr === 'string' && classAttr.split(/\s+/u).includes(className);
}

function extractSlideClasses(content) {
  return content.match(/_class:\s*([^\n]+)$/mu)?.[1] ?? '';
}

function slideHasClassMarker(content, className) {
  const markerMatch = String(content).match(slideClassMarkerPattern);
  return typeof markerMatch?.[1] === 'string' && markerMatch[1].split(/\s+/u).includes(`tmu-cs-slide-class--${className}`);
}

function parseClasses(rawValue) {
  return String(rawValue ?? '')
    .replace(/^['"]|['"]$/gu, '')
    .split(/\s+/u)
    .map((className) => className.trim())
    .filter(Boolean);
}

function prependSlideClassMarker(content, classNames) {
  const normalizedContent = String(content).replace(/^(?:[ \t]*\n)+/u, '');
  if (slideClassMarkerPattern.test(normalizedContent)) return normalizedContent;
  const markerClasses = classNames.map((className) => `tmu-cs-slide-class--${className}`).join(' ');
  const marker = `<span class="${markerClasses}"></span>`;
  const lines = normalizedContent.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed === '' || trimmed.startsWith('<!--')) continue;

    if (/^#{1,6}[ \t]+/u.test(lines[index])) {
      lines[index] = `${lines[index]} ${marker}`;
    } else {
      lines[index] = `${marker} ${lines[index]}`;
    }
    return lines.join('\n');
  }

  return `${marker}\n${normalizedContent}`;
}

function buildSectionPage(level, title) {
  return `${'#'.repeat(Math.max(1, level - 1))} ${title} <span class="tmu-cs-slide-class--section-page tmu-cs-slide-class--auxiliary-page"></span>`;
}

function buildTocList(items, baseLevel = null) {
  if (items.length === 0) return '';

  const effectiveBaseLevel = baseLevel ?? items[0]?.level ?? 1;
  return items
    .map((item) => {
      const depth = Math.max(0, item.level - effectiveBaseLevel);
      const indent = '  '.repeat(depth);
      return `${indent}- [${item.text}](#${item.slug})`;
    })
    .join('\n');
}

function resolveTocMaxLevel(frontMatter, fallbackLevel) {
  return parsePositiveInteger(frontMatter.tocPageMaxLevel, fallbackLevel);
}

function headingExcludedFromToc(heading) {
  return /<!--\s*fit\s*-->/iu.test(String(heading?.rawText ?? ''));
}

function findStandaloneTocCommand(slideContent) {
  const { lines } = splitLinesPreservingEOF(slideContent);
  let fence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!fence) {
      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
        continue;
      }

      const match = line.trim().match(tocCommandLinePattern);
      if (match) {
        return {
          lineIndex: index,
          level: match.groups?.level,
        };
      }

      continue;
    }

    if (isFenceClose(line, fence)) {
      fence = null;
    }
  }

  return null;
}

function replaceLineAtIndex(content, lineIndex, replacement) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return content;
  lines[lineIndex] = replacement;
  return lines.join('\n');
}

function hasMeaningfulContentBeforeHeading(slideContent, headingLineIndex) {
  const { lines } = splitLinesPreservingEOF(slideContent);
  let inComment = false;

  for (let index = 0; index < headingLineIndex; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!inComment && trimmed === '') continue;

    if (!inComment && trimmed.startsWith('<!--') && trimmed.endsWith('-->')) continue;

    if (!inComment && trimmed.startsWith('<!--')) {
      inComment = !trimmed.includes('-->');
      continue;
    }

    if (inComment) {
      if (trimmed.includes('-->')) inComment = false;
      continue;
    }

    return true;
  }

  return false;
}

function isIgnorableMarkdownLines(lines) {
  let inComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inComment && trimmed === '') continue;
    if (!inComment && /^<!--\s*_class:\s*.+-->$/u.test(trimmed)) continue;
    if (!inComment && trimmed.startsWith('<!--') && trimmed.endsWith('-->')) continue;

    if (!inComment && trimmed.startsWith('<!--')) {
      inComment = !trimmed.includes('-->');
      continue;
    }

    if (inComment) {
      if (trimmed.includes('-->')) inComment = false;
      continue;
    }

    return false;
  }

  return true;
}

function collectHeadingRecords(slides) {
  const slugger = createGitHubHeadingSlugger();
  const headingRecords = [];

  slides.forEach((slide, slideIndex) => {
    const classAttr = extractSlideClasses(slide.content);
    if (
      hasClass(classAttr, 'title-slide')
      || hasClass(classAttr, 'auxiliary-page')
      || slideHasClassMarker(slide.content, 'auxiliary-page')
    ) return;

    parseMarkdownHeadings(slide.content).forEach((heading) => {
      headingRecords.push({
        ...heading,
        slideIndex,
        slug: slugger.slug(heading.rawText),
      });
    });
  });

  return headingRecords;
}

function collectSections(headingRecords, sectionLevel) {
  const sectionHeadings = headingRecords.filter((heading) => heading.level === sectionLevel);

  return sectionHeadings.map((heading, index) => {
    const nextSection = sectionHeadings[index + 1];
    return {
      heading,
      items: headingRecords.filter((candidate) => (
        candidate.level > sectionLevel
        && (candidate.slideIndex > heading.slideIndex
          || (candidate.slideIndex === heading.slideIndex && candidate.lineIndex > heading.lineIndex))
        && (!nextSection
          || candidate.slideIndex < nextSection.slideIndex
          || (candidate.slideIndex === nextSection.slideIndex && candidate.lineIndex < nextSection.lineIndex))
      )),
    };
  });
}

function insertSectionPages(markdown, frontMatter) {
  if (!hasOwn(frontMatter, 'sectionPages') || isFalseLike(frontMatter.sectionPages)) {
    return markdown;
  }

  const sectionLevel = parsePositiveInteger(frontMatter.sectionPageLevel, 2);
  const { body, frontMatter: rawFrontMatter } = parseFrontMatter(markdown);
  const document = splitMarkdownSlides(body);
  const excludedSectionKeys = new Set(['references']);

  const slides = document.slides.flatMap((slide) => {
    const classAttr = extractSlideClasses(slide.content);
    if (
      hasClass(classAttr, 'title-slide')
      || hasClass(classAttr, 'auxiliary-page')
      || slideHasClassMarker(slide.content, 'auxiliary-page')
    ) return [slide];

    const headings = parseMarkdownHeadings(slide.content)
      .filter((heading) => (
        heading.level === sectionLevel
        && heading.text !== ''
        && !excludedSectionKeys.has(normalizeHeadingKey(heading.text))
      ));

    if (headings.length === 0) return [slide];

    const slideLines = slide.content.replace(/\r\n/g, '\n').split('\n');
    const producedSlides = [];
    let cursor = 0;

    for (const heading of headings) {
      const beforeLines = slideLines.slice(cursor, heading.lineIndex);
      const afterLines = slideLines.slice(heading.lineIndex + 1);
      const hasContentBeforeHeading = hasMeaningfulContentBeforeHeading(slide.content, heading.lineIndex);

      if (hasContentBeforeHeading || !isIgnorableMarkdownLines(beforeLines)) {
        producedSlides.push({
          ...slide,
          content: beforeLines.join('\n'),
        });
      }

      const sectionPageLines = [buildSectionPage(sectionLevel, heading.text)];
      if (isIgnorableMarkdownLines(afterLines) && afterLines.join('\n').trim() !== '') {
        sectionPageLines.push('', afterLines.join('\n'));
        cursor = slideLines.length;
      } else {
        cursor = heading.lineIndex + 1;
      }

      producedSlides.push({
        ...slide,
        content: sectionPageLines.join('\n'),
      });
    }

    const remainingLines = slideLines.slice(cursor);
    if (!isIgnorableMarkdownLines(remainingLines) || remainingLines.join('\n').trim() !== '') {
      if (!isIgnorableMarkdownLines(remainingLines)) {
        producedSlides.push({
          ...slide,
          content: remainingLines.join('\n'),
        });
      }
    }

    return producedSlides.filter((producedSlide) => producedSlide.content.trim() !== '');
  });

  return joinMarkdownSlides({
    frontMatter: rawFrontMatter,
    slides,
    hasTrailingNewline: document.hasTrailingNewline,
  });
}

function expandTocCommands(markdown, frontMatter, options = {}) {
  const sectionLevel = parsePositiveInteger(frontMatter.sectionPageLevel, 2);
  const defaultTocMaxLevel = resolveTocMaxLevel(frontMatter, sectionLevel);
  const document = splitMarkdownSlides(markdown);
  const headingRecords = collectHeadingRecords(document.slides);
  if (headingRecords.length === 0) return markdown;
  const sections = collectSections(headingRecords, sectionLevel);

  const sectionBySlideIndex = new Map();
  let currentSection = null;

  for (let slideIndex = 0; slideIndex < document.slides.length; slideIndex += 1) {
    const matchingSection = sections.find((section) => section.heading.slideIndex === slideIndex);
    if (matchingSection) currentSection = matchingSection;
    if (currentSection) sectionBySlideIndex.set(slideIndex, currentSection);
  }

  const slides = document.slides.map((slide, slideIndex) => {
    const commandMatch = findStandaloneTocCommand(slide.content);
    if (!commandMatch) return slide;
    const tocMaxLevel = parsePositiveInteger(commandMatch.level, defaultTocMaxLevel);

    const section = sectionBySlideIndex.get(slideIndex);
    if (!section) {
      const deckHeadings = headingRecords.filter((heading) => (
        heading.slideIndex !== slideIndex
        && heading.level <= tocMaxLevel
        && !headingExcludedFromToc(heading)
      ));
      return {
        ...slide,
        content: prependSlideClassMarker(
          replaceLineAtIndex(
            slide.content,
            commandMatch.lineIndex,
            buildTocList(deckHeadings, deckHeadings[0]?.level ?? null),
          ),
          ['toc-page', 'auxiliary-page'],
        ),
      };
    }

    const tocItems = section.items.filter((item) => item.level <= tocMaxLevel && !headingExcludedFromToc(item));
    const toc = buildTocList(tocItems, sectionLevel + 1);
    if (toc === '') {
      options.onWarning?.(`toc command for section "${section.heading.text}" produced no items.`);
    }

    return {
      ...slide,
      content: prependSlideClassMarker(
        replaceLineAtIndex(slide.content, commandMatch.lineIndex, toc),
        ['toc-page', 'auxiliary-page'],
      ),
    };
  });

  return joinMarkdownSlides({
    frontMatter: document.frontMatter,
    slides,
    hasTrailingNewline: document.hasTrailingNewline,
  });
}

export default function applySectionPages(markdown, options = {}) {
  const { data: frontMatter } = parseFrontMatter(markdown);
  const withExpandedToc = expandTocCommands(markdown, frontMatter, options);
  return insertSectionPages(withExpandedToc, frontMatter);
}
