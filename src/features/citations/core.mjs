import { joinMarkdownSlides, splitMarkdownSlides } from '../../core/markdown.mjs';
import {
  appendBlock,
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
  return String(markdown ?? '').trim() === '';
}

function createWarningRelay(onWarning) {
  return (message) => {
    onWarning?.({ message });
  };
}

export function normalizeCitationOptions(options = {}) {
  const frontMatter = options.frontMatter ?? {};

  return {
    defaultCslPath: options.defaultCslPath,
    frontMatter,
    markdownPath: options.markdownPath,
    onWarning: options.onWarning,
  };
}

export function applyCitationRenderResult(renderResult, options = {}) {
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
    } = slide;
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
    );
    const slideFootnotes = (slide.citedKeys ?? [])
      .map((key) => renderResult.entriesByKey.get(key))
      .filter(Boolean);

    let content = slideWithMarkdownFootnotes;

    if (slideFootnotes.length > 0) {
      content = appendBlock(
        content,
        renderCitationListBlock(slideFootnotes, 'citation-footnotes-marker', 'citation-footnote-label'),
      );
    }

    if (markdownFootnotes.length > 0) {
      content = appendBlock(
        content,
        renderCitationListBlock(markdownFootnotes, 'citation-footnotes-marker', 'citation-footnote-label'),
      );
    }

    if (hadRefsBlock) {
      referencesWereRequested = true;

      if (isEffectivelyEmpty(content)) {
        content = appendBlock('# References', bibliographyBlock);
        referencesInserted = bibliographyBlock !== '';
      } else if (slideHasReferenceHeading(content)) {
        content = appendBlock(content, bibliographyBlock);
        referencesInserted = bibliographyBlock !== '';
      }
    }

    if (!hadRefsBlock && slideIsReferenceHeadingOnly(content) && bibliographyBlock !== '') {
      referencesWereRequested = true;
      content = appendBlock(content, bibliographyBlock);
      referencesInserted = true;
    }

    transformedSlides.push(content);
  }

  if (bibliographyBlock !== '' && (!referencesWereRequested || !referencesInserted)) {
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
