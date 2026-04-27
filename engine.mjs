import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHighlighter } from 'shiki';
import { installCodeFeature } from './src/features/code/index.mjs';
import { supportedShikiLanguages } from './src/features/code/shared.mjs';
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

export default async ({ marp }) => {
  const [highlighter, themeCss] = await Promise.all([
    highlighterPromise,
    readFile(themeCssUrl, 'utf8'),
  ]);

  marp.themeSet.add(themeCss);

  const originalRenderMarkdown = marp.renderMarkdown.bind(marp);
  const mathFeature = installMathFeature(marp, { logPrefix });
  installCodeFeature(marp, { highlighter, logPrefix });
  const standaloneEnabled = process.env.TMU_CS_STANDALONE === '1';
  const standaloneOutputPath = process.env.TMU_CS_STANDALONE_OUTPUT;

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

    const renderedHtml = recalculateAuxiliaryPagination(enhanceAnimatedImages(originalRenderMarkdown(preparedMarkdown, env), {
      markdownPath,
    }));

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
