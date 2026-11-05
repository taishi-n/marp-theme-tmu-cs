import { joinMarkdownSlides, splitMarkdownSlides } from '../../core/markdown.mjs';
import { stripSlideSource } from '../../core/slide-source.mjs';
import {
  appendBlock,
  collectInlineReferenceOrder,
  containsCitationSyntax,
  containsMarkdownFootnoteSyntax,
  extractMarkdownFootnotes,
  hasBibliography,
  normalizeBibliographyReferences,
  renderCitationListBlock,
  renderCitationOrderedListBlock,
  replaceMarkdownFootnoteReferences,
  slideIsReferenceHeadingOnly,
  slideHasReferenceHeading,
  stripReferenceListPlaceholder,
} from './markdown-utils.mjs';

function isEffectivelyEmpty(markdown) {
  return stripSlideSource(markdown).trim() === '';
}

function createWarningRelay(onWarning) {
  return (message) => {
    onWarning?.({ message });
  };
}

export function normalizeCitationOptions(options = {}) {
  const frontMatter = options.frontMatter ?? {};
  const citationDisplay = frontMatter.citationDisplay ?? 'both';
  if (!['footnotes', 'bibliography', 'both'].includes(citationDisplay)) {
    throw new Error('[tmu-cs] citationDisplay must be footnotes, bibliography, or both.');
  }

  return {
    citationDisplay,
    defaultCslPath: options.defaultCslPath,
    frontMatter,
    markdownPath: options.markdownPath,
    onWarning: options.onWarning,
  };
}

export function applyCitationRenderResult(renderResult, options = {}) {
  const { citationDisplay } = normalizeCitationOptions(options);
  const showCitationFootnotes = citationDisplay !== 'bibliography';
  const showBibliography = citationDisplay !== 'footnotes';
  const onWarning = createWarningRelay(options.onWarning);
  const transformedSlides = [];
  const bibliographyBlock = renderCitationOrderedListBlock(
    renderResult.allEntries ?? [],
    'citation-bibliography-list',
    'citation-bibliography-item',
  );
  let referencesInserted = false;
  let referencesWereRequested = false;
  const extractedSlides = (renderResult.slides ?? []).map((slide) => {
    const strippedRefs = stripReferenceListPlaceholder(slide.content);
    const extractedFootnotes = extractMarkdownFootnotes(strippedRefs.content);

    return {
      ...slide,
      hadRefsBlock: strippedRefs.hadRefsBlock,
      slideWithoutMarkdownFootnoteDefs: extractedFootnotes.content,
      markdownFootnoteDefinitions: extractedFootnotes.definitions,
      referenceOrder: slide.referenceOrder ?? collectInlineReferenceOrder(slide.content),
    };
  });
  const crossSlideFootnoteDefinitions = new Map();

  for (const slide of extractedSlides) {
    for (const id of slide.markdownFootnoteDefinitions.keys()) {
      if (!crossSlideFootnoteDefinitions.has(id)) {
        crossSlideFootnoteDefinitions.set(id, slide.startLine);
      }
    }
  }

  for (const slide of extractedSlides) {
    const {
      hadRefsBlock,
      markdownFootnoteDefinitions,
      slideWithoutMarkdownFootnoteDefs,
      referenceOrder,
    } = slide;
    const footnoteOrder = showCitationFootnotes ? referenceOrder : referenceOrder.filter((reference) => reference.type === 'footnote');
    const referenceNumbers = new Map(footnoteOrder.map((reference, index) => [
      reference.type === 'footnote' ? reference.id : `citation:${reference.key}`,
      index + 1,
    ]));
    const { content: slideWithMarkdownFootnotes, footnotes: markdownFootnotes } = replaceMarkdownFootnoteReferences(
      slideWithoutMarkdownFootnoteDefs,
      markdownFootnoteDefinitions,
      (message) => {
        const missingId = message.match(/footnote "([^"]+)"/u)?.[1];
        const foreignDefinitionLine = missingId ? crossSlideFootnoteDefinitions.get(missingId) : undefined;

        if (missingId && typeof foreignDefinitionLine === 'number' && !markdownFootnoteDefinitions.has(missingId)) {
          onWarning(`footnote "${missingId}" must be defined in the same slide as its reference. This reference is in the slide starting near markdown line ${slide.startLine}, but the definition starts near line ${foreignDefinitionLine}.`);
          return;
        }

        onWarning(message);
      },
      new Map(footnoteOrder
        .filter((reference) => reference.type === 'footnote')
        .map((reference) => [reference.id, referenceNumbers.get(reference.id)])),
    );
    const markdownFootnotesById = new Map(markdownFootnotes.map((footnote) => [footnote.id, footnote]));
    const slideFootnotes = footnoteOrder.map((reference, index) => {
      if (reference.type === 'citation') {
        const entry = renderResult.entriesByKey.get(reference.key);
        return entry ? { ...entry, label: `[${index + 1}]` } : undefined;
      }

      const footnote = markdownFootnotesById.get(reference.id);
      return footnote ? { ...footnote, label: `[${index + 1}]` } : undefined;
    }).filter(Boolean);

    let content = slideWithMarkdownFootnotes;

    if (slideFootnotes.length > 0) {
      content = appendBlock(
        content,
        renderCitationListBlock(slideFootnotes, 'citation-footnotes-marker', 'citation-footnote-label'),
      );
    }

    if (!showBibliography && (slideIsReferenceHeadingOnly(content) || (hadRefsBlock && isEffectivelyEmpty(content)))) continue;

    if (showBibliography && hadRefsBlock) {
      referencesWereRequested = true;

      if (isEffectivelyEmpty(content)) {
        content = appendBlock('# References', bibliographyBlock);
        referencesInserted = bibliographyBlock !== '';
      } else if (slideHasReferenceHeading(content)) {
        content = appendBlock(content, bibliographyBlock);
        referencesInserted = bibliographyBlock !== '';
      }
    }

    if (showBibliography && !hadRefsBlock && slideIsReferenceHeadingOnly(content) && bibliographyBlock !== '') {
      referencesWereRequested = true;
      content = appendBlock(content, bibliographyBlock);
      referencesInserted = true;
    }

    transformedSlides.push(content);
  }

  if (showBibliography && bibliographyBlock !== '' && (!referencesWereRequested || !referencesInserted)) {
    transformedSlides.push(appendBlock('# References', bibliographyBlock));
  }

  return joinMarkdownSlides({
    frontMatter: renderResult.frontMatter ?? '',
    slides: transformedSlides,
    hasTrailingNewline: renderResult.hasTrailingNewline ?? false,
  });
}

export function preprocessCitationsWithBackend(markdown, backend, options = {}) {
  const normalizedOptions = normalizeCitationOptions(options);
  const { frontMatter } = normalizedOptions;
  const hasBibliographyConfigured = hasBibliography(frontMatter);
  const hasFootnotes = containsMarkdownFootnoteSyntax(markdown);

  if (!hasBibliographyConfigured) {
    if (containsCitationSyntax(markdown)) {
      throw new Error('[tmu-cs] citation syntax was detected, but YAML front matter does not define bibliography:.');
    }

    if (!hasFootnotes) return markdown;

    const splitMarkdown = splitMarkdownSlides(markdown);
    return applyCitationRenderResult({
      slides: splitMarkdown.slides.map((slide) => ({
        ...slide,
        citedKeys: [],
        referenceOrder: collectInlineReferenceOrder(slide.content),
      })),
      entriesByKey: new Map(),
      allEntries: [],
      frontMatter: splitMarkdown.frontMatter,
      hasTrailingNewline: splitMarkdown.hasTrailingNewline,
    }, normalizedOptions);
  }

  const splitMarkdown = splitMarkdownSlides(markdown);
  const renderResult = backend.render(splitMarkdown.slides, {
    bibliographyReferences: normalizeBibliographyReferences(frontMatter),
    cslPath: frontMatter.csl,
    defaultCslPath: normalizedOptions.defaultCslPath,
    frontMatter,
    markdownPath: normalizedOptions.markdownPath,
    onWarning: normalizedOptions.onWarning,
  });

  return applyCitationRenderResult({
    ...renderResult,
    frontMatter: splitMarkdown.frontMatter,
    hasTrailingNewline: splitMarkdown.hasTrailingNewline,
  }, normalizedOptions);
}

export { hasBibliography, normalizeBibliographyReferences };
