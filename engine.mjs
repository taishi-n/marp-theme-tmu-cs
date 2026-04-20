import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, join, resolve as resolvePath } from 'node:path';
import jsYaml from 'js-yaml';
import { createHighlighter } from 'shiki';
import {
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
} from '@shikijs/transformers';
import expandStepSlides from './src/markdown/expand-step-slides.mjs';
import processCitations from './src/markdown/process-citations.mjs';
import resolveExternalCode from './src/markdown/resolve-external-code.mjs';
import { collectMathAnnotations, renderAnnotatedMathBlock } from './src/math/annotate-math-block.mjs';
import { createAnnotateTransformer, inspectAnnotatedCodeBlock } from './src/shiki/annotate-transformer.mjs';

const themeName = 'tmu-cs';
const logPrefix = `[${themeName}]`;
const themeCssUrl = new URL(`./theme/${themeName}.css`, import.meta.url);
const defaultCitationStylePath = fileURLToPath(new URL('./vendor/csl/ieee.csl', import.meta.url));
const pandocCiteFilterPath = fileURLToPath(new URL('./src/pandoc/citation-placeholder.lua', import.meta.url));
const { FAILSAFE_SCHEMA, load } = jsYaml;
const baseFontSizePx = 16;
const slideContentHeightPx = 720 - 84 - 86;
const bodyLineHeightPx = baseFontSizePx * 1.35;
const bodyBlockGapPx = baseFontSizePx;
const defaultCodeFontSizePx = baseFontSizePx * 0.85;
const customCodeMarginTopPx = baseFontSizePx * 0.35;
const codePaddingYPx = baseFontSizePx * 2;
const customCodeBorderYPx = 2;
const codeWarningTolerancePx = 4;

const headingHeightsPx = {
  h1: (baseFontSizePx * 1.36 * 1.18) + (baseFontSizePx * 0.52) + (baseFontSizePx * 0.18) + (baseFontSizePx * 0.08),
  h2: (baseFontSizePx * 0.98 * 1.18) + (baseFontSizePx * 0.42),
  h3: (baseFontSizePx * 0.72 * 1.18) + (baseFontSizePx * 0.34),
};

const codeAnnotationBaseHeightPx = (baseFontSizePx * 0.55) + (baseFontSizePx * 0.75 * 2) + 2 + (baseFontSizePx * 0.72 * 1.35) + (baseFontSizePx * 0.22 * 2);
const codeAnnotationAdditionalHeightPx = (baseFontSizePx * 0.3) + (baseFontSizePx * 0.45) + (baseFontSizePx * 0.22 * 2) + 1 + (baseFontSizePx * 0.72 * 1.35);

const highlighterPromise = createHighlighter({
  themes: ['github-light'],
  langs: ['cpp'],
});

function normalizeFenceLanguage(info = '') {
  const [language = ''] = info.trim().split(/\s+/, 1);
  const lower = language.toLowerCase();

  if (lower === 'cpp' || lower === 'c++') return 'cpp';
  return lower;
}

function normalizeText(text) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parseFrontMatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    return { body: markdown, data: {}, frontMatter: '' };
  }

  let data = {};

  try {
    const parsed = load(match[1], { schema: FAILSAFE_SCHEMA });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch {
    data = {};
  }

  return {
    body: markdown.slice(match[0].length),
    data,
    frontMatter: match[0],
  };
}

function getDeckMetadata(frontMatter) {
  return {
    affiliation: asNonEmptyString(frontMatter.affiliation),
    author: asNonEmptyString(frontMatter.author),
    date: asNonEmptyString(frontMatter.date),
    subtitle: asNonEmptyString(frontMatter.subtitle) ?? asNonEmptyString(frontMatter.description),
    title: asNonEmptyString(frontMatter.title),
  };
}

function getConfiguredCodeLinkLanguages(frontMatter) {
  const configured = frontMatter.codeLinkLanguages ?? frontMatter.externalCodeLanguages;

  if (Array.isArray(configured)) {
    return configured
      .filter((value) => typeof value === 'string' && value.trim() !== '')
      .map((value) => value.trim());
  }

  if (typeof configured === 'string' && configured.trim() !== '') {
    return [configured.trim()];
  }

  return [];
}

function getFirstSlide(markdown) {
  const separator = /^\s*---\s*$/m.exec(markdown);
  return separator ? markdown.slice(0, separator.index) : markdown;
}

function firstSlideHasTitleClass(markdown) {
  return /\btitle-slide\b/.test(getFirstSlide(markdown));
}

function firstSlideLooksLikeTitleSlide(markdown, metadata) {
  if (!metadata.title) return false;

  const significantLines = getFirstSlide(markdown)
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (significantLines.length === 0) return false;
  if (!significantLines[0].startsWith('# ')) return false;
  if (normalizeText(significantLines[0].slice(2)) !== normalizeText(metadata.title)) return false;

  const rest = significantLines.slice(1);

  if (rest.length > 4) return false;
  if (rest.some((line) => /^[-*+]\s/.test(line) || /^\d+\.\s/.test(line) || /^```/.test(line))) return false;

  return true;
}

function isFalseLike(value) {
  return value === false || value === 'false' || value === '0';
}

function buildDefaultMarginals(frontMatter, metadata) {
  const directives = [];

  if (!hasOwn(frontMatter, 'header')) {
    const header = [metadata.title, metadata.subtitle].filter(Boolean).join(' / ');
    if (header) directives.push(`header: ${JSON.stringify(header)}`);
  }

  if (!hasOwn(frontMatter, 'footer')) {
    const footer = [metadata.author, metadata.date].filter(Boolean).join(' / ');
    if (footer) directives.push(`footer: ${JSON.stringify(footer)}`);
  }

  if (directives.length === 0) return '';

  return `<!--\n${directives.join('\n')}\n-->\n\n`;
}

function buildTitleSlide(frontMatter, metadata, body) {
  if (!metadata.title || isFalseLike(frontMatter.titleSlide)) {
    return { body, prefix: '' };
  }

  if (firstSlideHasTitleClass(body)) {
    return { body, prefix: '' };
  }

  if (firstSlideLooksLikeTitleSlide(body, metadata)) {
    return { body, prefix: '<!-- _class: title-slide -->\n\n' };
  }

  const lines = ['<!-- _class: title-slide -->', '', `# ${metadata.title}`];

  if (metadata.subtitle) {
    lines.push('', `## ${metadata.subtitle}`);
  }

  if (metadata.author) {
    lines.push('', `### ${metadata.author}`);
  }

  if (metadata.affiliation) {
    lines.push('', `#### ${metadata.affiliation}`);
  }

  if (metadata.date) {
    lines.push('', `#### ${metadata.date}`);
  }

  const titleSlide = `${lines.join('\n')}\n`;
  const trimmedBody = body.trimStart();

  if (trimmedBody === '') {
    return { body: titleSlide, prefix: '' };
  }

  return {
    body: `${titleSlide}\n---\n\n${trimmedBody}`,
    prefix: '',
  };
}

function applyDeckDefaults(markdown) {
  const { body, data: frontMatter, frontMatter: rawFrontMatter } = parseFrontMatter(markdown);
  const metadata = getDeckMetadata(frontMatter);
  const marginalDirectives = buildDefaultMarginals(frontMatter, metadata);
  const { body: bodyWithTitleSlide, prefix } = buildTitleSlide(frontMatter, metadata, body);

  return {
    frontMatter,
    markdown: `${rawFrontMatter}${marginalDirectives}${prefix}${bodyWithTitleSlide}`,
  };
}

function createWarningLogger(token) {
  const markdownStartLine = token.map?.[0];

  return ({ line, message }) => {
    const location = typeof line === 'number' ? `line ${line}` : 'code block';
    const block = typeof markdownStartLine === 'number' ? ` (fence starts near markdown line ${markdownStartLine + 1})` : '';
    console.warn(`${logPrefix} ${location}: ${message}${block}`);
  };
}

function findWorkspaceFile(candidate, currentDir = process.cwd()) {
  const normalizedCandidate = String(candidate ?? '').replaceAll('\\', '/');
  const fileName = basename(normalizedCandidate);
  const skippedDirectories = new Set(['.git', 'node_modules']);
  const matches = [];

  const walk = (directory, relativeDirectory = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skippedDirectories.has(entry.name)) continue;

        const nextRelative = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
        walk(join(directory, entry.name), nextRelative);
        continue;
      }

      if (!entry.isFile() || entry.name !== fileName) continue;

      const relativeFile = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (
        relativeFile === normalizedCandidate
        || relativeFile.endsWith(`/${normalizedCandidate}`)
        || entry.name === normalizedCandidate
      ) {
        matches.push(join(directory, entry.name));
      }
    }
  };

  walk(currentDir);
  return matches.length === 1 ? matches[0] : undefined;
}

function findMarkdownFileByContent(markdown, currentDir = process.cwd()) {
  const target = String(markdown ?? '').replace(/\r\n/g, '\n');
  const skippedDirectories = new Set(['.git', 'node_modules']);
  const matches = [];

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skippedDirectories.has(entry.name)) continue;
        walk(join(directory, entry.name));
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const filePath = join(directory, entry.name);

      try {
        const content = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
        if (content === target) matches.push(filePath);
      } catch {
        // Ignore unreadable candidates and continue discovery.
      }
    }
  };

  walk(currentDir);
  return matches.length === 1 ? matches[0] : undefined;
}

function getMarkdownPathFromEnv(env = {}, markdown) {
  const candidates = [env.file?.absolutePath, env.file?.relativePath, env.path]
    .filter((candidate) => typeof candidate === 'string' && candidate !== '');

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;

    const resolvedCandidate = resolvePath(candidate);
    if (existsSync(resolvedCandidate)) return resolvedCandidate;

    const discoveredCandidate = findWorkspaceFile(candidate);
    if (discoveredCandidate) return discoveredCandidate;
  }

  return findMarkdownFileByContent(markdown);
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

function warnForOverflowingCodeBlocks(markdown, marp, env = {}) {
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
      const overflowPx = codeBlockHeightPx - availableHeightPx;

      if (overflowPx > codeWarningTolerancePx) {
        const line = Array.isArray(token.map) ? token.map[0] + 1 : undefined;
        const lineSuffix = typeof line === 'number' ? ` line ${line}` : '';

        console.warn(
          `${logPrefix} slide ${slideNumber}${lineSuffix}: code block is estimated to overflow the drawable area by ${formatPixels(overflowPx)} (available ${formatPixels(availableHeightPx)}, needs ${formatPixels(codeBlockHeightPx)}).`,
        );
      }

      usedHeightPx += codeBlockHeightPx;
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

export default async ({ marp }) => {
  const [highlighter, themeCss] = await Promise.all([
    highlighterPromise,
    readFile(themeCssUrl, 'utf8'),
  ]);

  marp.themeSet.add(themeCss);

  const originalRenderMarkdown = marp.renderMarkdown.bind(marp);
  const defaultFence = marp.markdown.renderer.rules.fence;
  const defaultMathBlock = marp.markdown.renderer.rules.marp_math_block;
  let shouldInjectMathAnnotationRuntime = true;

  marp.renderMarkdown = (markdown, env = {}) => {
    shouldInjectMathAnnotationRuntime = true;
    const markdownPath = getMarkdownPathFromEnv(env, markdown);
    const { data: sourceFrontMatter } = parseFrontMatter(markdown);
    const citedMarkdown = processCitations(markdown, {
      defaultCslPath: defaultCitationStylePath,
      frontMatter: sourceFrontMatter,
      markdownPath,
      onWarning: ({ message }) => {
        console.warn(`${logPrefix} ${message}`);
      },
      pandocCiteFilterPath,
    });
    const preparedDeck = applyDeckDefaults(citedMarkdown);
    const resolvedMarkdown = resolveExternalCode(preparedDeck.markdown, {
      allowedLanguages: getConfiguredCodeLinkLanguages(preparedDeck.frontMatter),
      markdownPath,
      onWarning: ({ line, message }) => {
        const location = typeof line === 'number' ? `line ${line}` : 'markdown';
        console.warn(`${logPrefix} ${location}: ${message}`);
      },
    });

    const expandedMarkdown = expandStepSlides(resolvedMarkdown, {
      onWarning: ({ line, message }) => {
        const location = typeof line === 'number' ? `line ${line}` : 'markdown';
        console.warn(`${logPrefix} ${location}: ${message}`);
      },
    });

    try {
      warnForOverflowingCodeBlocks(expandedMarkdown, marp, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${logPrefix} Failed to estimate code block overflow. ${message}`);
    }

    return originalRenderMarkdown(expandedMarkdown, env);
  };

  marp.markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const language = normalizeFenceLanguage(token.info);
    const source = token.content.replace(/\r?\n$/, '');

    if (language !== 'cpp') {
      return stripCodeBlockAutoScaling(defaultFence(tokens, idx, options, env, self));
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
            onWarning: createWarningLogger(token),
            sourceLineOffset: typeof token.map?.[0] === 'number' ? token.map[0] + 1 : 0,
          }),
        ],
      });

      return normalizeShikiPreTag(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${logPrefix} Failed to render cpp block with Shiki. Falling back to default renderer. ${message}`);
      return stripCodeBlockAutoScaling(defaultFence(tokens, idx, options, env, self));
    }
  };

  marp.markdown.renderer.rules.marp_math_block = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const originalContent = token.content;
    const mathAnnotations = collectMathAnnotations(originalContent, {
      onWarning: createWarningLogger(token),
      sourceLineOffset: typeof token.map?.[0] === 'number' ? token.map[0] + 1 : 0,
    });

    try {
      token.content = mathAnnotations.math;
      const rendered = defaultMathBlock(tokens, idx, options, env, self);
      return renderAnnotatedMathBlock(rendered, mathAnnotations, {
        injectRuntime: shouldInjectMathAnnotationRuntime,
        onWarning: createWarningLogger(token),
      });
    } finally {
      if (mathAnnotations.annotations.length > 0) shouldInjectMathAnnotationRuntime = false;
      token.content = originalContent;
    }
  };

  return marp;
};
