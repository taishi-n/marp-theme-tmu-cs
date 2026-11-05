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
import { getMarkdownPathFromEnv, prepareMarkdownForRender, warnForPreparedMarkdown } from './src/pipeline/markdown-pipeline.mjs';
import { initializeMarp } from './src/pipeline/marp-instance.mjs';

const themeName = 'tmu-cs';
const logPrefix = `[${themeName}]`;
const themeCssUrl = new URL(`./theme/${themeName}.css`, import.meta.url);
const defaultCitationStylePath = fileURLToPath(new URL('./vendor/csl/ieee.csl', import.meta.url));

function findOutputArgument(args = []) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') break;

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
  const explicitFormat = process.env.TMU_CS_OUTPUT_FORMAT;
  if (['html', 'image', 'images', 'notes', 'pdf', 'pptx'].includes(explicitFormat)) return explicitFormat;
  const normalizedArgs = args.map((arg) => String(arg));
  const terminatorIndex = normalizedArgs.indexOf('--');
  const optionArgs = terminatorIndex === -1 ? normalizedArgs : normalizedArgs.slice(0, terminatorIndex);

  if (optionArgs.some((arg) => arg === '--pdf')) return 'pdf';
  if (optionArgs.some((arg) => arg === '--pptx')) return 'pptx';
  if (optionArgs.some((arg) => arg === '--image' || arg.startsWith('--image='))) return 'image';
  if (optionArgs.some((arg) => arg === '--images' || arg.startsWith('--images='))) return 'images';
  if (optionArgs.some((arg) => arg === '--notes')) return 'notes';

  const outputPath = findOutputArgument(optionArgs)?.toLowerCase();
  if (outputPath?.endsWith('.pdf')) return 'pdf';
  if (outputPath?.endsWith('.pptx')) return 'pptx';
  if (outputPath?.endsWith('.png') || outputPath?.endsWith('.jpg') || outputPath?.endsWith('.jpeg')) return 'image';
  if (outputPath?.endsWith('.txt')) return 'notes';

  return 'html';
}

export default async (options = {}) => {
  const outputFormat = detectOutputFormat();
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
  const standaloneEnabled = process.env.TMU_CS_STANDALONE === '1';
  const standaloneOutputPath = process.env.TMU_CS_STANDALONE_OUTPUT;
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
    const markdownPath = getMarkdownPathFromEnv(env, markdown, configuredMarkdownPaths);
    const { markdown: preparedMarkdown, frontMatter: preparedFrontMatter } = prepareMarkdownForRender(markdown, {
      allowLocalFiles,
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

    const renderedHtml = decorateAuxiliarySlides(enhanceAnimatedImages(originalRenderMarkdown(preparedMarkdown, env), {
      allowLocalFiles,
      markdownPath,
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
      outputPath: standaloneOutputPath,
      onWarning: (message) => {
        console.warn(`${logPrefix} ${message}`);
      },
    });
  };

  return marp;
};
