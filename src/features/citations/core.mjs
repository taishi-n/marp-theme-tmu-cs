import { joinSlides, splitSlides } from './markdown-slides.mjs';
import {
  appendBlock,
  containsCitationSyntax,
  escapeHtml,
  extractMarkdownFootnotes,
  hasBibliography,
  normalizeBibliographyReferences,
  normalizeDisplayMathBlocks,
  renderCitationListBlock,
  replaceCitationPlaceholders,
  replaceMarkdownFootnoteReferences,
  restorePandocFencedDivs,
  restorePandocRawHtml,
  restoreProtectedMarkdownFootnotes,
  slideHasReferenceHeading,
  stripPandocHeadingAttributes,
  stripPandocRefsBlock,
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
    pandocCiteFilterPath: options.pandocCiteFilterPath,
  };
}

export function applyCitationRenderResult(markdown, renderResult, options = {}) {
  const onWarning = createWarningRelay(options.onWarning);
  const normalizedMarkdown = restorePandocFencedDivs(
    restoreProtectedMarkdownFootnotes(
      restorePandocRawHtml(normalizeDisplayMathBlocks(renderResult.renderedMarkdown)),
    ),
  );
  const { frontMatter: rawFrontMatter, slides, hasTrailingNewline } = splitSlides(normalizedMarkdown);
  const transformedSlides = [];
  const bibliographyBlock = renderCitationListBlock(
    renderResult.allEntries ?? [],
    'citation-bibliography-marker',
    'citation-bibliography-label',
  );
  let referencesInserted = false;
  let referencesWereRequested = false;

  for (const slide of slides) {
    const strippedHeadingAttributes = stripPandocHeadingAttributes(slide);
    const { content: slideWithoutRefs, hadRefsBlock } = stripPandocRefsBlock(strippedHeadingAttributes);
    const { content: slideWithoutMarkdownFootnoteDefs, definitions: markdownFootnoteDefinitions } = extractMarkdownFootnotes(slideWithoutRefs);
    const { content: slideWithMarkdownFootnotes, footnotes: markdownFootnotes } = replaceMarkdownFootnoteReferences(
      slideWithoutMarkdownFootnoteDefs,
      markdownFootnoteDefinitions,
      onWarning,
    );
    const { content: slideWithInlineCitations, citedKeys } = replaceCitationPlaceholders(
      slideWithMarkdownFootnotes,
      renderResult.entriesByKey ?? new Map(),
      onWarning,
    );
    const slideFootnotes = citedKeys
      .map((key) => renderResult.entriesByKey.get(key))
      .filter(Boolean);

    let content = slideWithInlineCitations;

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
        content = appendBlock('## References', bibliographyBlock);
        referencesInserted = bibliographyBlock !== '';
      } else if (slideHasReferenceHeading(content)) {
        content = appendBlock(content, bibliographyBlock);
        referencesInserted = bibliographyBlock !== '';
      }
    }

    transformedSlides.push(content);
  }

  if (bibliographyBlock !== '' && (!referencesWereRequested || !referencesInserted)) {
    transformedSlides.push(appendBlock('## References', bibliographyBlock));
  }

  return joinSlides({
    frontMatter: rawFrontMatter,
    slides: transformedSlides,
    hasTrailingNewline,
  });
}

export function preprocessCitationsWithBackend(markdown, backend, options = {}) {
  const normalizedOptions = normalizeCitationOptions(options);
  const { frontMatter } = normalizedOptions;

  if (!hasBibliography(frontMatter)) {
    if (containsCitationSyntax(markdown)) {
      throw new Error('[tmu-cs] citation syntax was detected, but YAML front matter does not define bibliography:.');
    }

    return markdown;
  }

  const renderResult = backend.render(markdown, {
    bibliographyReferences: normalizeBibliographyReferences(frontMatter),
    cslPath: frontMatter.csl,
    defaultCslPath: normalizedOptions.defaultCslPath,
    markdownPath: normalizedOptions.markdownPath,
    onWarning: normalizedOptions.onWarning,
    pandocCiteFilterPath: normalizedOptions.pandocCiteFilterPath,
  });

  return applyCitationRenderResult(markdown, renderResult, normalizedOptions);
}

export { escapeHtml, hasBibliography, normalizeBibliographyReferences };
