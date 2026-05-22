import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHighlighter } from 'shiki';
import { installCodeFeature } from './src/features/code/index.mjs';
import { supportedShikiLanguages } from './src/features/code/shared.mjs';
import { installDiagramFeature } from './src/features/diagrams/index.mjs';
import { createKrokiBackend } from './src/features/diagrams/kroki-backend.mjs';
import { installMathFeature } from './src/features/math/index.mjs';
import enhanceAnimatedImages from './src/pipeline/animated-images.mjs';
import recalculateAuxiliaryPagination from './src/pipeline/auxiliary-pagination.mjs';
import inlineStandaloneAssets from './src/pipeline/standalone-assets.mjs';
import { getMarkdownPathFromEnv, prepareMarkdownForRender, warnForPreparedMarkdown } from './src/pipeline/markdown-pipeline.mjs';

const themeName = 'tmu-cs';
const logPrefix = `[${themeName}]`;
const themeCssUrl = new URL(`./theme/${themeName}.css`, import.meta.url);
const defaultCitationStylePath = fileURLToPath(new URL('./vendor/csl/ieee.csl', import.meta.url));

const highlighterPromise = createHighlighter({
  themes: ['github-light'],
  langs: supportedShikiLanguages,
});

function findOutputArgument(args = []) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '-o' || argument === '--output') {
      const next = args[index + 1];
      return typeof next === 'string' && next !== '' ? next : undefined;
    }

    if (argument.startsWith('--output=')) {
      return argument.slice('--output='.length);
    }
  }

  return undefined;
}

function detectOutputFormat(args = process.argv.slice(2)) {
  const normalizedArgs = args.map((arg) => String(arg));

  if (normalizedArgs.some((arg) => arg === '--pdf')) return 'pdf';
  if (normalizedArgs.some((arg) => arg === '--pptx')) return 'pptx';
  if (normalizedArgs.some((arg) => arg === '--image' || arg.startsWith('--image='))) return 'image';
  if (normalizedArgs.some((arg) => arg === '--images' || arg.startsWith('--images='))) return 'images';
  if (normalizedArgs.some((arg) => arg === '--notes')) return 'notes';

  const outputPath = findOutputArgument(normalizedArgs)?.toLowerCase();
  if (outputPath?.endsWith('.pdf')) return 'pdf';
  if (outputPath?.endsWith('.pptx')) return 'pptx';
  if (outputPath?.endsWith('.png') || outputPath?.endsWith('.jpg') || outputPath?.endsWith('.jpeg')) return 'image';
  if (outputPath?.endsWith('.txt')) return 'notes';

  return 'html';
}

function renderNativeEmojiHtml(html) {
  return String(html ?? '').replace(
    /<img class="emoji"[^>]*\balt="([^"]*)"[^>]*\bdata-marp-twemoji=""[^>]*\/>/gu,
    (_, alt) => alt,
  );
}

export default async ({ marp }) => {
  const [highlighter, themeCss] = await Promise.all([
    highlighterPromise,
    readFile(themeCssUrl, 'utf8'),
  ]);

  marp.themeSet.add(themeCss);

  const originalRenderMarkdown = marp.renderMarkdown.bind(marp);
  const mathFeature = installMathFeature(marp, { logPrefix });
  installDiagramFeature(marp, {
    backend: createKrokiBackend(),
  });
  installCodeFeature(marp, { highlighter, logPrefix });
  const standaloneEnabled = process.env.TMU_CS_STANDALONE === '1';
  const standaloneOutputPath = process.env.TMU_CS_STANDALONE_OUTPUT;
  const outputFormat = detectOutputFormat();

  marp.renderMarkdown = (markdown, env = {}) => {
    mathFeature.resetRuntimeInjection();
    const markdownPath = getMarkdownPathFromEnv(env, markdown);
    const { markdown: preparedMarkdown } = prepareMarkdownForRender(markdown, {
      defaultCitationStylePath,
      markdownPath,
      onWarning: (message) => {
        console.warn(`${logPrefix} ${message}`);
      },
    });

    try {
      warnForPreparedMarkdown(preparedMarkdown, {
        env,
        logPrefix,
        marp,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${logPrefix} Failed to estimate code block overflow. ${message}`);
    }

    let renderedHtml = recalculateAuxiliaryPagination(enhanceAnimatedImages(originalRenderMarkdown(preparedMarkdown, env), {
      markdownPath,
    }));

    if (outputFormat === 'html') {
      renderedHtml = renderNativeEmojiHtml(renderedHtml);
    }

    if (!standaloneEnabled) return renderedHtml;

    return inlineStandaloneAssets(renderedHtml, {
      markdownPath,
      outputPath: standaloneOutputPath,
      onWarning: (message) => {
        console.warn(`${logPrefix} ${message}`);
      },
    });
  };

  return marp;
};
