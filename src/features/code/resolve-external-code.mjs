import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { isFenceClose, parseFenceStart } from '../../core/markdown.mjs';
import {
  inferLanguageFromPath,
  normalizeFenceLanguage,
  parseFenceInfo,
} from './shared.mjs';

function parseStandaloneMarkdownLink(line) {
  const trimmed = String(line ?? '').trim();

  if (trimmed === '' || trimmed.startsWith('![') || !trimmed.startsWith('[')) return null;

  const labelEnd = trimmed.indexOf('](');
  if (labelEnd <= 0) return null;

  const label = trimmed.slice(1, labelEnd);
  let cursor = labelEnd + 2;

  let destination = '';

  if (trimmed[cursor] === '<') {
    const destinationEnd = trimmed.indexOf('>', cursor + 1);
    if (destinationEnd === -1) return null;

    destination = trimmed.slice(cursor + 1, destinationEnd);
    cursor = destinationEnd + 1;
  } else {
    const destinationStart = cursor;

    while (cursor < trimmed.length && !/[\s)]/.test(trimmed[cursor])) cursor += 1;
    destination = trimmed.slice(destinationStart, cursor);
  }

  if (destination === '') return null;

  while (cursor < trimmed.length && /\s/.test(trimmed[cursor])) cursor += 1;

  let title;

  if (trimmed[cursor] === '"' || trimmed[cursor] === "'") {
    const quote = trimmed[cursor];
    cursor += 1;

    const titleStart = cursor;
    while (cursor < trimmed.length && trimmed[cursor] !== quote) cursor += 1;
    if (cursor >= trimmed.length) return null;

    title = trimmed.slice(titleStart, cursor);
    cursor += 1;
    while (cursor < trimmed.length && /\s/.test(trimmed[cursor])) cursor += 1;
  } else if (trimmed[cursor] === '(') {
    cursor += 1;

    const titleStart = cursor;
    while (cursor < trimmed.length && trimmed[cursor] !== ')') cursor += 1;
    if (cursor >= trimmed.length) return null;

    title = trimmed.slice(titleStart, cursor);
    cursor += 1;
    while (cursor < trimmed.length && /\s/.test(trimmed[cursor])) cursor += 1;
  }

  if (trimmed[cursor] !== ')') return null;

  cursor += 1;
  if (cursor !== trimmed.length) return null;

  return {
    label,
    destination,
    title,
  };
}

function splitContentLines(content) {
  const normalized = String(content ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function resolveReferencePath(reference, markdownPath) {
  if (isAbsolute(reference)) return reference;

  const baseDir = typeof markdownPath === 'string' ? dirname(markdownPath) : process.cwd();
  return resolve(baseDir, reference);
}

function isRelativeMarkdownLink(destination) {
  const value = String(destination ?? '').trim();

  if (value === '' || value.startsWith('#') || value.startsWith('//')) return false;
  if (isAbsolute(value)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;

  return true;
}

function createFenceLines(source, language) {
  const backtickRuns = String(source ?? '').match(/`+/g) ?? [];
  const longestBacktickRun = backtickRuns.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));

  return [`${fence}${language}`, ...splitContentLines(source), fence];
}

function formatFenceAttribute(key, value) {
  if (value === 'true') return key;

  const escapedValue = String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  return `${key}="${escapedValue}"`;
}

function buildExpandedFenceOpening(fence, language, attributes) {
  const marker = fence.marker.repeat(fence.length);
  const renderedAttributes = Object.entries(attributes)
    .filter(([key]) => key !== 'path' && key !== 'src')
    .map(([key, value]) => formatFenceAttribute(key, value));

  const infoParts = [language, ...renderedAttributes].filter((part) => String(part ?? '').trim() !== '');
  return infoParts.length > 0 ? `${marker}${infoParts.join(' ')}` : marker;
}

function readExternalSource(reference, options) {
  const resolvedPath = resolveReferencePath(reference, options.markdownPath);

  try {
    return readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tmu-cs] line ${options.lineNumber}: failed to read external code file "${reference}" (${resolvedPath}). ${message}`);
  }
}

function resolveCodeLink(link, options) {
  if (!isRelativeMarkdownLink(link.destination)) return null;

  const inferredLanguage = inferLanguageFromPath(link.destination);
  if (inferredLanguage === '') return null;

  const source = readExternalSource(link.destination, options);
  return createFenceLines(source, inferredLanguage);
}

export function resolveExternalCode(markdown, options = {}) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const openingLineNumber = index + 1;
    const standaloneLink = parseStandaloneMarkdownLink(line);

    if (standaloneLink) {
      const resolvedLinkLines = resolveCodeLink(standaloneLink, {
        lineNumber: openingLineNumber,
        markdownPath: options.markdownPath,
      });

      if (resolvedLinkLines) {
        output.push(...resolvedLinkLines);
        continue;
      }
    }

    const fence = parseFenceStart(line);

    if (!fence) {
      output.push(line);
      continue;
    }

    const { info, length, marker } = fence;
    const parsedInfo = parseFenceInfo(info);
    const language = normalizeFenceLanguage(parsedInfo.language);
    const externalPath = parsedInfo.attributes.path ?? parsedInfo.attributes.src;
    const inferredLanguage = externalPath ? inferLanguageFromPath(externalPath) : '';
    const resolvedLanguage = inferredLanguage || language;

    const blockLines = [line];
    const codeLines = [];
    let cursor = index + 1;

    while (cursor < lines.length && !isFenceClose(lines[cursor], { marker, length })) {
      codeLines.push(lines[cursor]);
      blockLines.push(lines[cursor]);
      cursor += 1;
    }

    if (cursor < lines.length) {
      blockLines.push(lines[cursor]);
    } else {
      output.push(...blockLines);
      break;
    }

    if (externalPath && resolvedLanguage !== '') {
      if (codeLines.some((codeLine) => codeLine.trim().length > 0)) {
        options.onWarning?.({
          line: openingLineNumber,
          message: `external code fence for "${externalPath}" ignores inline block content.`,
        });
      }

      const source = readExternalSource(externalPath, {
        lineNumber: openingLineNumber,
        markdownPath: options.markdownPath,
      });

      output.push(
        buildExpandedFenceOpening({ marker, length }, resolvedLanguage, parsedInfo.attributes),
        ...splitContentLines(source),
        lines[cursor],
      );
    } else {
      if (externalPath && resolvedLanguage === '') {
        options.onWarning?.({
          line: openingLineNumber,
          message: `external code fence for "${externalPath}" was not expanded because its language could not be inferred from the file extension.`,
        });
      }

      output.push(...blockLines);
    }

    index = cursor;
  }

  return output.join('\n');
}

export default resolveExternalCode;
