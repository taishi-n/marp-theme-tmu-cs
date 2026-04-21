import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHighlighter } from 'shiki';
import { installCodeFeature } from './src/features/code/index.mjs';
import { installMathFeature } from './src/features/math/index.mjs';
import enhanceAnimatedImages from './src/pipeline/animated-images.mjs';
import { getMarkdownPathFromEnv, prepareMarkdownForRender, warnForPreparedMarkdown } from './src/pipeline/markdown-pipeline.mjs';

const themeName = 'tmu-cs';
const logPrefix = `[${themeName}]`;
const themeCssUrl = new URL(`./theme/${themeName}.css`, import.meta.url);
const defaultCitationStylePath = fileURLToPath(new URL('./vendor/csl/ieee.csl', import.meta.url));

const highlighterPromise = createHighlighter({
  themes: ['github-light'],
  langs: ['cpp'],
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

    return enhanceAnimatedImages(originalRenderMarkdown(preparedMarkdown, env));
  };

  return marp;
};
