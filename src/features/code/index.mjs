import {
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
} from '@shikijs/transformers';
import expandStepSlides from './expand-step-slides.mjs';
import resolveExternalCode from './resolve-external-code.mjs';
import { getConfiguredCodeLinkLanguages, normalizeFenceLanguage, parseFenceInfo } from './shared.mjs';
import { createAnnotateTransformer, inspectAnnotatedCodeBlock } from '../../shiki/annotate-transformer.mjs';
import { createWrapLongLinesTransformer, wrapCodeSource } from '../../shiki/wrap-long-lines-transformer.mjs';

const baseFontSizePx = 16;
const slideWidthPx = 1280;
const slideSidePaddingPx = 72;
const slideContentHeightPx = 720 - 84 - 86;
const bodyLineHeightPx = baseFontSizePx * 1.35;
const bodyBlockGapPx = baseFontSizePx;
const defaultCodeFontSizePx = baseFontSizePx * 0.85;
const customCodeMarginTopPx = baseFontSizePx * 0.35;
const codePaddingYPx = baseFontSizePx * 2;
const codePaddingXPx = baseFontSizePx * 2;
const codeLineInsetPx = (baseFontSizePx * 0.45) + (baseFontSizePx * 0.24);
const customCodeBorderYPx = 2;
const codeWarningTolerancePx = 4;
const monospaceCharWidthPx = defaultCodeFontSizePx * 0.62;
const htmlBodyWrapScale = 0.59;
const fitHeightMetaKey = '__tmuCodeFitHeight';

const headingHeightsPx = {
  h1: (baseFontSizePx * 1.36 * 1.18) + (baseFontSizePx * 0.52) + (baseFontSizePx * 0.18) + (baseFontSizePx * 0.08),
  h2: (baseFontSizePx * 0.98 * 1.18) + (baseFontSizePx * 0.42),
  h3: (baseFontSizePx * 0.72 * 1.18) + (baseFontSizePx * 0.34),
};

const codeAnnotationBaseHeightPx = (baseFontSizePx * 0.55) + (baseFontSizePx * 0.75 * 2) + 2 + (baseFontSizePx * 0.72 * 1.35) + (baseFontSizePx * 0.22 * 2);
const codeAnnotationAdditionalHeightPx = (baseFontSizePx * 0.3) + (baseFontSizePx * 0.45) + (baseFontSizePx * 0.22 * 2) + 1 + (baseFontSizePx * 0.72 * 1.35);

function isTruthyAttribute(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'fit', 'fit-height'].includes(normalized);
}

function shouldFitCodeHeight(token) {
  const { attributes } = parseFenceInfo(token.info);
  return isTruthyAttribute(attributes['fit-height'])
    || isTruthyAttribute(attributes.fitHeight)
    || isTruthyAttribute(attributes['auto-scale'])
    || isTruthyAttribute(attributes.autoScale);
}

function createMarkdownWarningEmitter(onWarning) {
  return ({ line, message }) => {
    const location = typeof line === 'number' ? `line ${line}` : 'markdown';
    onWarning?.(`${location}: ${message}`);
  };
}

function createWarningLogger(token, logPrefix) {
  const markdownStartLine = token.map?.[0];

  return ({ line, message }) => {
    const location = typeof line === 'number' ? `line ${line}` : 'code block';
    const block = typeof markdownStartLine === 'number' ? ` (fence starts near markdown line ${markdownStartLine + 1})` : '';
    console.warn(`${logPrefix} ${location}: ${message}${block}`);
  };
}

function getCodeWrapOptions() {
  const availableWidthPx = (slideWidthPx - (slideSidePaddingPx * 2) - codePaddingXPx - codeLineInsetPx) * htmlBodyWrapScale;
  const maxColumns = Math.max(24, Math.floor(availableWidthPx / monospaceCharWidthPx));

  return {
    maxColumns,
    continuationMarker: ' \\',
  };
}

function countCodeLines(source) {
  const normalized = String(source ?? '').replace(/\r\n/g, '\n');
  const body = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return body === '' ? 1 : body.split('\n').length;
}

function lineSpanFromMap(map) {
  if (!Array.isArray(map) || map.length !== 2) return 1;
  return Math.max(1, map[1] - map[0]);
}

function estimateMappedBlockHeight(token, options = {}) {
  return (
    lineSpanFromMap(token.map) * (options.lineHeightPx ?? bodyLineHeightPx)
    + (options.bottomMarginPx ?? bodyBlockGapPx)
  );
}

function findMatchingCloseIndex(tokens, startIndex) {
  const openToken = tokens[startIndex];
  const closeType = openToken.type.replace(/_open$/, '_close');

  if (closeType === openToken.type) return startIndex;

  let depth = 0;

  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === openToken.type) depth += 1;
    if (token.type !== closeType) continue;

    depth -= 1;
    if (depth === 0) return index;
  }

  return startIndex;
}

function estimateCodeAnnotationHeight(annotationCount) {
  if (annotationCount <= 0) return 0;
  return codeAnnotationBaseHeightPx + ((annotationCount - 1) * codeAnnotationAdditionalHeightPx);
}

function estimateCodeBlockHeight(token, options = {}) {
  const language = normalizeFenceLanguage(token.info);

  if (language === 'cpp') {
    const { annotationCount, lineCount } = inspectAnnotatedCodeBlock(token.content);

    return (
      (options.hasPreviousContent ? customCodeMarginTopPx : 0)
      + codePaddingYPx
      + customCodeBorderYPx
      + (lineCount * baseFontSizePx)
      + estimateCodeAnnotationHeight(annotationCount)
    );
  }

  return codePaddingYPx + (countCodeLines(token.content) * defaultCodeFontSizePx);
}

function formatPixels(value) {
  return `${Math.max(0, Math.round(value))}px`;
}

function stripCodeBlockAutoScaling(html) {
  return String(html ?? '').replace(/\sdata-auto-scaling="[^"]*"/g, '');
}

function normalizeShikiPreTag(html) {
  return stripCodeBlockAutoScaling(html).replace(/^<pre\b([^>]*)>/, (_match, attrs) => {
    const normalizedAttrs = String(attrs ?? '').replace(/\sstyle="[^"]*"/, '');
    return `<pre is="marp-pre"${normalizedAttrs}>`;
  });
}

function wrapFittedCodeBlock(html, fit) {
  if (!fit || fit.scale >= 1) return html;

  const style = `--tmu-code-scale:${fit.scale.toFixed(4)};--tmu-code-fit-height:${Math.max(1, Math.ceil(fit.fittedHeightPx))}px;`;
  return `<div class="tmu-code-fit-height" style="${style}"><div class="tmu-code-fit-height__inner">${html}</div></div>`;
}

function computeFitHeightMetadata(tokens) {
  let slideLevel = null;
  let usedHeightPx = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'marpit_slide_open') {
      slideLevel = token.level;
      usedHeightPx = 0;
      continue;
    }

    if (token.type === 'marpit_slide_close') {
      slideLevel = null;
      continue;
    }

    if (slideLevel === null || token.level !== slideLevel + 1) continue;

    if (token.type === 'heading_open') {
      usedHeightPx += headingHeightsPx[token.tag] ?? estimateMappedBlockHeight(token, { bottomMarginPx: 0 });
      index = findMatchingCloseIndex(tokens, index);
      continue;
    }

    if (token.type === 'fence') {
      const blockHeightPx = estimateCodeBlockHeight(token, {
        hasPreviousContent: usedHeightPx > 0,
      });

      if (shouldFitCodeHeight(token)) {
        const availableHeightPx = Math.max(1, slideContentHeightPx - usedHeightPx);
        const scale = Math.min(1, availableHeightPx / Math.max(1, blockHeightPx));
        token.meta ??= {};
        token.meta[fitHeightMetaKey] = {
          enabled: true,
          scale,
          fittedHeightPx: blockHeightPx * scale,
        };
        usedHeightPx += blockHeightPx * scale;
      } else {
        usedHeightPx += blockHeightPx;
      }
      continue;
    }

    if (token.type === 'paragraph_open' || token.type === 'bullet_list_open' || token.type === 'ordered_list_open' || token.type === 'blockquote_open' || token.type === 'table_open') {
      usedHeightPx += estimateMappedBlockHeight(token);
      index = findMatchingCloseIndex(tokens, index);
      continue;
    }

    if (token.type === 'html_block' || token.type === 'marp_math_block' || token.type === 'hr') {
      usedHeightPx += estimateMappedBlockHeight(token);
    }
  }
}

export function preprocessCodeMarkdown(markdown, options = {}) {
  const resolvedMarkdown = resolveExternalCode(markdown, {
    allowedLanguages: getConfiguredCodeLinkLanguages(options.frontMatter ?? {}),
    markdownPath: options.markdownPath,
    onWarning: createMarkdownWarningEmitter(options.onWarning),
  });

  return expandStepSlides(resolvedMarkdown, {
    onWarning: createMarkdownWarningEmitter(options.onWarning),
  });
}

export function warnForOverflowingCodeBlocks(markdown, marp, env = {}, options = {}) {
  const tokens = marp.markdown.parse(markdown, { ...env });
  let slideNumber = 0;
  let slideLevel = null;
  let usedHeightPx = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'marpit_slide_open') {
      slideNumber += 1;
      slideLevel = token.level;
      usedHeightPx = 0;
      continue;
    }

    if (token.type === 'marpit_slide_close') {
      slideLevel = null;
      continue;
    }

    if (slideLevel === null || token.level !== slideLevel + 1) continue;

    if (token.type === 'heading_open') {
      usedHeightPx += headingHeightsPx[token.tag] ?? estimateMappedBlockHeight(token, { bottomMarginPx: 0 });
      index = findMatchingCloseIndex(tokens, index);
      continue;
    }

    if (token.type === 'fence') {
      const codeBlockHeightPx = estimateCodeBlockHeight(token, {
        hasPreviousContent: usedHeightPx > 0,
      });
      const availableHeightPx = slideContentHeightPx - usedHeightPx;
      const renderedHeightPx = shouldFitCodeHeight(token)
        ? Math.min(codeBlockHeightPx, Math.max(1, availableHeightPx))
        : codeBlockHeightPx;
      const overflowPx = renderedHeightPx - availableHeightPx;

      if (overflowPx > codeWarningTolerancePx) {
        const line = Array.isArray(token.map) ? token.map[0] + 1 : undefined;
        const lineSuffix = typeof line === 'number' ? ` line ${line}` : '';
        console.warn(
          `${options.logPrefix} slide ${slideNumber}${lineSuffix}: code block is estimated to overflow the drawable area by ${formatPixels(overflowPx)} (available ${formatPixels(availableHeightPx)}, needs ${formatPixels(renderedHeightPx)}).`,
        );
      }

      usedHeightPx += renderedHeightPx;
      continue;
    }

    if (token.type === 'paragraph_open' || token.type === 'bullet_list_open' || token.type === 'ordered_list_open' || token.type === 'blockquote_open' || token.type === 'table_open') {
      usedHeightPx += estimateMappedBlockHeight(token);
      index = findMatchingCloseIndex(tokens, index);
      continue;
    }

    if (token.type === 'html_block' || token.type === 'marp_math_block' || token.type === 'hr') {
      usedHeightPx += estimateMappedBlockHeight(token);
    }
  }
}

export function installCodeFeature(marp, options = {}) {
  const defaultFence = marp.markdown.renderer.rules.fence;
  const highlighter = options.highlighter;
  const logPrefix = options.logPrefix;

  marp.markdown.renderer.rules.fence = (tokens, idx, renderOptions, env, self) => {
    const token = tokens[idx];
    const language = normalizeFenceLanguage(token.info);
    const source = token.content.replace(/\r?\n$/, '');
    const codeWrapOptions = getCodeWrapOptions();
    if (idx === 0 || tokens[idx - 1]?.meta?.[fitHeightMetaKey] === undefined) {
      computeFitHeightMetadata(tokens);
    }
    const fitHeight = token.meta?.[fitHeightMetaKey];

    if (language !== 'cpp') {
      const originalContent = token.content;

      try {
        token.content = wrapCodeSource(originalContent, codeWrapOptions);
        return wrapFittedCodeBlock(
          stripCodeBlockAutoScaling(defaultFence(tokens, idx, renderOptions, env, self)),
          fitHeight,
        );
      } finally {
        token.content = originalContent;
      }
    }

    try {
      const html = highlighter.codeToHtml(source, {
        lang: 'cpp',
        theme: 'github-light',
        transformers: [
          transformerNotationHighlight({
            classActiveLine: 'is-highlighted',
            classActivePre: 'has-highlighted',
          }),
          transformerNotationFocus({
            classActiveLine: 'is-focused',
            classActivePre: 'has-focused',
          }),
          transformerNotationErrorLevel({
            classMap: {
              warning: 'is-warning',
              error: 'is-error',
              info: 'is-info',
            },
            classActivePre: 'has-message-lines',
          }),
          createAnnotateTransformer({
            onWarning: createWarningLogger(token, logPrefix),
            sourceLineOffset: typeof token.map?.[0] === 'number' ? token.map[0] + 1 : 0,
          }),
          createWrapLongLinesTransformer(codeWrapOptions),
        ],
      });

      return wrapFittedCodeBlock(normalizeShikiPreTag(html), fitHeight);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${logPrefix} Failed to render cpp block with Shiki. Falling back to default renderer. ${message}`);
      return wrapFittedCodeBlock(
        stripCodeBlockAutoScaling(defaultFence(tokens, idx, renderOptions, env, self)),
        fitHeight,
      );
    }
  };
}

export default {
  install: installCodeFeature,
  preprocessMarkdown: preprocessCodeMarkdown,
  warnForOverflowingCodeBlocks,
};
