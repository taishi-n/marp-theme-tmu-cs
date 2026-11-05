import {
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
} from '@shikijs/transformers';
import expandStepSlides from './expand-step-slides.mjs';
import resolveExternalCode from './resolve-external-code.mjs';
import {
  normalizeCodeLanguage,
  parseFenceInfo,
} from './shared.mjs';
import { createWrapLongLinesTransformer, wrapCodeSource } from '../../shiki/wrap-long-lines-transformer.mjs';
import { codeLayoutMetrics, headingHeightsPx } from './layout-metrics.mjs';

const {
  bodyBlockGapPx,
  bodyLineHeightPx,
  codeBorderYPx,
  codeFontSizePx,
  codeLineHeightPx,
  codeMarginBottomPx,
  codePaddingXPx,
  codePaddingYPx,
  slideContentHeightPx,
  slideSidePaddingPx,
  slideWidthPx,
} = codeLayoutMetrics;
const codeWarningTolerancePx = 4;
const monospaceCharWidthPx = codeFontSizePx * 0.62;
const fitHeightMetaKey = '__tmuCodeFitHeight';

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

function getCodeWrapOptions() {
  const availableWidthPx = slideWidthPx - (slideSidePaddingPx * 2) - codePaddingXPx;
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

function estimateCodeBlockHeight(token) {
  const wrappedSource = wrapCodeSource(token.content, getCodeWrapOptions());

  return (
    + codePaddingYPx
    + codeBorderYPx
    + (countCodeLines(wrappedSource) * codeLineHeightPx)
    + codeMarginBottomPx
  );
}

function formatPixels(value) {
  return `${Math.max(0, Math.round(value))}px`;
}

function stripCodeBlockAutoScaling(html) {
  return String(html ?? '').replace(/\sdata-auto-scaling="[^"]*"/g, '');
}

function normalizeShikiPreTag(html) {
  return stripCodeBlockAutoScaling(html).replace(/^<pre\b([^>]*)>/, (_match, attrs) => {
    let normalizedAttrs = String(attrs ?? '').replace(/\sstyle="[^"]*"/, '').replace(/\sis="[^"]*"/, '');
    const classMatch = normalizedAttrs.match(/\sclass="([^"]*)"/);

    if (classMatch) {
      const classes = classMatch[1].split(/\s+/).filter(Boolean);
      if (!classes.includes('marp-code')) classes.push('marp-code');
      normalizedAttrs = normalizedAttrs.replace(/\sclass="[^"]*"/, ` class="${classes.join(' ')}"`);
    } else {
      normalizedAttrs += ' class="marp-code"';
    }

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
      const blockHeightPx = estimateCodeBlockHeight(token);

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
    allowLocalFiles: options.allowLocalFiles === true,
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
      const codeBlockHeightPx = estimateCodeBlockHeight(token);
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
  const coreHighlighter = marp.highlighter.bind(marp);
  const codeWrapOptions = getCodeWrapOptions();
  marp.shikiTransformers.push(
    transformerNotationHighlight({ classActiveLine: 'is-highlighted', classActivePre: 'has-highlighted' }),
    transformerNotationFocus({ classActiveLine: 'is-focused', classActivePre: 'has-focused' }),
    transformerNotationErrorLevel({
      classMap: { warning: 'is-warning', error: 'is-error', info: 'is-info' },
      classActivePre: 'has-message-lines',
    }),
    createWrapLongLinesTransformer(codeWrapOptions),
  );
  marp.highlighter = (source, language, attrs) => {
    try {
      const rendered = coreHighlighter(source, normalizeCodeLanguage(language) || 'text', attrs);
      if (rendered) return rendered;
    } catch (error) {
      console.warn(`${options.logPrefix} Failed to highlight ${language}; rendering as plain text. ${error}`);
    }
    return coreHighlighter(source, 'text', attrs);
  };

  marp.markdown.renderer.rules.fence = (tokens, idx, renderOptions, env, self) => {
    const token = tokens[idx];
    if (idx === 0 || tokens[idx - 1]?.meta?.[fitHeightMetaKey] === undefined) {
      computeFitHeightMetadata(tokens);
    }
    const fitHeight = token.meta?.[fitHeightMetaKey];

    const html = defaultFence.call(self, tokens, idx, renderOptions, env, self);
    return wrapFittedCodeBlock(normalizeShikiPreTag(html), fitHeight);
  };
}

export default {
  install: installCodeFeature,
  preprocessMarkdown: preprocessCodeMarkdown,
  warnForOverflowingCodeBlocks,
};
