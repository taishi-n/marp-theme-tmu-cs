import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { parseFrontMatter } from '../core/front-matter.mjs';
import { preprocessCitationMarkdown } from '../features/citations/index.mjs';
import { preprocessCodeMarkdown, warnForOverflowingCodeBlocks } from '../features/code/index.mjs';
import applyDeckDefaults from './deck-defaults.mjs';
import applyMediaPlayback from './media-playback.mjs';
import applySectionPages from './section-pages.mjs';

export function getMarkdownPathFromEnv(env = {}, markdown, configuredPaths = []) {
  const candidates = [env.file?.absolutePath, env.file?.relativePath, env.path]
    .filter((candidate) => typeof candidate === 'string' && candidate !== '');

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;

    const resolvedCandidate = resolvePath(candidate);
    if (existsSync(resolvedCandidate)) return resolvedCandidate;
  }

  const existingConfiguredPaths = configuredPaths.filter((candidate) => (
    typeof candidate === 'string' && candidate !== '' && existsSync(candidate)
  ));
  if (existingConfiguredPaths.length === 1) return existingConfiguredPaths[0];

  if (existingConfiguredPaths.length > 1 && typeof markdown === 'string') {
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n');
    const matches = existingConfiguredPaths.filter((candidate) => {
      try {
        return readFileSync(candidate, 'utf8').replace(/\r\n/g, '\n') === normalizedMarkdown;
      } catch {
        return false;
      }
    });
    if (matches.length === 1) return matches[0];
  }

  return undefined;
}

export function prepareMarkdownForRender(markdown, context) {
  const { data: sourceFrontMatter } = parseFrontMatter(markdown);
  const citedMarkdown = preprocessCitationMarkdown(markdown, {
    defaultCslPath: context.defaultCitationStylePath,
    frontMatter: sourceFrontMatter,
    markdownPath: context.markdownPath,
    onWarning: ({ message }) => {
      context.onWarning?.(`${message}`);
    },
  });
  const preparedDeck = applyDeckDefaults(citedMarkdown);
  const sectionedMarkdown = applySectionPages(preparedDeck.markdown, {
    onWarning: (message) => {
      context.onWarning?.(`${message}`);
    },
  });
  const resolvedMarkdown = preprocessCodeMarkdown(sectionedMarkdown, {
    allowLocalFiles: context.allowLocalFiles === true,
    frontMatter: preparedDeck.frontMatter,
    markdownPath: context.markdownPath,
    onWarning: context.onWarning,
  });
  const mediaPreparedMarkdown = applyMediaPlayback(resolvedMarkdown, {
    defaultMode: preparedDeck.frontMatter.mediaPlayback,
    onWarning: context.onWarning,
  });

  return {
    frontMatter: preparedDeck.frontMatter,
    markdown: mediaPreparedMarkdown,
  };
}

export function warnForPreparedMarkdown(markdown, context) {
  warnForOverflowingCodeBlocks(markdown, context.marp, context.env, {
    logPrefix: context.logPrefix,
  });
}
