import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve as resolvePath } from 'node:path';
import { parseFrontMatter } from '../core/front-matter.mjs';
import { preprocessCitationMarkdown } from '../features/citations/index.mjs';
import { preprocessCodeMarkdown, warnForOverflowingCodeBlocks } from '../features/code/index.mjs';
import applyDeckDefaults from './deck-defaults.mjs';

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

export function getMarkdownPathFromEnv(env = {}, markdown) {
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
  const resolvedMarkdown = preprocessCodeMarkdown(preparedDeck.markdown, {
    frontMatter: preparedDeck.frontMatter,
    markdownPath: context.markdownPath,
    onWarning: context.onWarning,
  });

  return {
    frontMatter: preparedDeck.frontMatter,
    markdown: resolvedMarkdown,
  };
}

export function warnForPreparedMarkdown(markdown, context) {
  warnForOverflowingCodeBlocks(markdown, context.marp, context.env, {
    logPrefix: context.logPrefix,
  });
}
