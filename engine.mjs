import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installCodeFeature } from './src/features/code/index.mjs';
import { installDiagramFeature } from './src/features/diagrams/index.mjs';
import { createKrokiBackend } from './src/features/diagrams/kroki-backend.mjs';
import { installMathFeature } from './src/features/math/index.mjs';
import enhanceAnimatedImages from './src/pipeline/animated-images.mjs';
import decorateAuxiliarySlides, { installSlideMetadata } from './src/pipeline/slide-metadata.mjs';
import installMediaPlayback from './src/pipeline/media-playback.mjs';
import inlineStandaloneAssets from './src/pipeline/standalone-assets.mjs';
import { loadThemeOverrides } from './src/pipeline/theme-overrides.mjs';
import { getMarkdownPathFromEnv, prepareMarkdownForRender } from './src/pipeline/markdown-pipeline.mjs';
import { initializeMarp } from './src/pipeline/marp-instance.mjs';
import { detectOutputFormat, validateOutputFormat } from './src/core/output-format.mjs';

const themeName = 'tmu-cs';
const logPrefix = `[${themeName}]`;
const themeCssUrl = new URL(`./theme/${themeName}.css`, import.meta.url);
const defaultCitationStylePath = fileURLToPath(new URL('./vendor/csl/ieee.csl', import.meta.url));

export default async (options = {}) => {
  const outputFormat = validateOutputFormat(options.outputFormat ?? process.env.TMU_CS_OUTPUT_FORMAT ?? detectOutputFormat(process.argv.slice(2)));
  const standaloneEnabled = process.env.TMU_CS_STANDALONE === '1';
  if (standaloneEnabled && outputFormat !== 'html') throw new Error('[tmu-cs] --standalone is supported only for HTML output.');
  const marp = initializeMarp(options, outputFormat);
  const themeCss = await readFile(themeCssUrl, 'utf8');

  const overridePaths = JSON.parse(process.env.TMU_CS_THEME_OVERRIDES ?? '[]');
  const overrideCss = loadThemeOverrides(overridePaths, {
    allowLocalFiles: process.env.TMU_CS_ALLOW_LOCAL_FILES === '1',
    embedRemote: process.env.TMU_CS_STANDALONE === '1',
  });
  marp.themeSet.add(`${themeCss}\n${overrideCss}`);

  const originalRenderMarkdown = marp.renderMarkdown.bind(marp);
  const mathFeature = installMathFeature(marp, { logPrefix });
  installCodeFeature(marp, { logPrefix });
  installDiagramFeature(marp, {
    backend: createKrokiBackend(),
  });
  installSlideMetadata(marp);
  installMediaPlayback(marp, {
    onWarning: (message) => console.warn(`${logPrefix} ${message}`),
  });
  const allowLocalFiles = process.env.TMU_CS_ALLOW_LOCAL_FILES === '1'
    || process.argv.slice(2).includes('--allow-local-files');
  let configuredMarkdownPaths = [];
  try {
    const parsedPaths = JSON.parse(process.env.TMU_CS_MARKDOWN_PATHS ?? '[]');
    if (Array.isArray(parsedPaths)) configuredMarkdownPaths = parsedPaths;
  } catch {
    console.warn(`${logPrefix} Ignoring invalid TMU_CS_MARKDOWN_PATHS configuration.`);
  }

  marp.renderMarkdown = (markdown, env = {}) => {
    mathFeature.resetRuntimeInjection();
    const assetCache = new Map();
    const markdownPath = getMarkdownPathFromEnv(env, markdown, configuredMarkdownPaths);
    const { markdown: preparedMarkdown, frontMatter: preparedFrontMatter } = prepareMarkdownForRender(markdown, {
      allowLocalFiles,
      defaultCitationStylePath,
      markdownPath,
      onWarning: (message) => {
        console.warn(`${logPrefix} ${message}`);
      },
    });

    const renderedHtml = decorateAuxiliarySlides(enhanceAnimatedImages(originalRenderMarkdown(preparedMarkdown, env), {
      allowLocalFiles,
      markdownPath,
      assetCache,
    }), {
      editLabels: outputFormat === 'html' && (String(preparedFrontMatter?.editLabels) === 'true' || process.env.TMU_CS_EDIT_LABELS === '1'),
      onSlides: (slides) => {
        const index = { version: 1, sourcePath: markdownPath ?? null, slides };
        marp.tmuCsSlides = index;
        if (process.env.TMU_CS_SLIDE_INDEX) {
          mkdirSync(dirname(process.env.TMU_CS_SLIDE_INDEX), { recursive: true });
          writeFileSync(process.env.TMU_CS_SLIDE_INDEX, `${JSON.stringify(index, null, 2)}\n`);
        }
      },
    });

    if (!standaloneEnabled) return renderedHtml;

    return inlineStandaloneAssets(renderedHtml, {
      allowLocalFiles,
      markdownPath,
      assetCache,
    });
  };

  return marp;
};
