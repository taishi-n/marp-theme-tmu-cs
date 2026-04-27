import { joinMarkdownSlides, splitMarkdownSlides } from '../../core/markdown.mjs';
import {
  appendBlock,
  containsCitationSyntax,
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

  for (const slide of renderResult.slides ?? []) {
    const { content: slideWithoutRefs, hadRefsBlock } = stripReferenceListPlaceholder(slide.content);
    const { content: slideWithoutMarkdownFootnoteDefs, definitions: markdownFootnoteDefinitions } = extractMarkdownFootnotes(slideWithoutRefs);
    const { content: slideWithMarkdownFootnotes, footnotes: markdownFootnotes } = replaceMarkdownFootnoteReferences(
      slideWithoutMarkdownFootnoteDefs,
      markdownFootnoteDefinitions,
      onWarning,
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

  if (!hasBibliography(frontMatter)) {
    if (containsCitationSyntax(markdown)) {
      throw new Error('[tmu-cs] citation syntax was detected, but YAML front matter does not define bibliography:.');
    }

    return markdown;
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
