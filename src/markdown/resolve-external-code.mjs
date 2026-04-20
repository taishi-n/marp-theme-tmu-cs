import { readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';

const extensionLanguageMap = new Map([
  ['bash', 'shell'],
  ['c', 'c'],
  ['cc', 'cpp'],
  ['cpp', 'cpp'],
  ['cs', 'csharp'],
  ['css', 'css'],
  ['fs', 'fsharp'],
  ['fsx', 'fsharp'],
  ['go', 'go'],
  ['hh', 'cpp'],
  ['hpp', 'cpp'],
  ['hs', 'haskell'],
  ['html', 'html'],
  ['hxx', 'cpp'],
  ['java', 'java'],
  ['jl', 'julia'],
  ['js', 'javascript'],
  ['json', 'json'],
  ['jsx', 'jsx'],
  ['kt', 'kotlin'],
  ['kts', 'kotlin'],
  ['lua', 'lua'],
  ['mjs', 'javascript'],
  ['php', 'php'],
  ['pl', 'perl'],
  ['py', 'python'],
  ['r', 'r'],
  ['rb', 'ruby'],
  ['rs', 'rust'],
  ['scala', 'scala'],
  ['sh', 'shell'],
  ['sql', 'sql'],
  ['swift', 'swift'],
  ['toml', 'toml'],
  ['ts', 'typescript'],
  ['tsx', 'tsx'],
  ['yaml', 'yaml'],
  ['yml', 'yaml'],
  ['zsh', 'shell'],
]);

function normalizeLanguageName(language = '') {
  const normalized = String(language ?? '').trim().toLowerCase();

  if (normalized === '') return '';
  if (normalized === 'c++') return 'cpp';
  if (normalized === 'js') return 'javascript';
  if (normalized === 'ts') return 'typescript';
  if (normalized === 'py') return 'python';
  if (normalized === 'rb') return 'ruby';
  if (normalized === 'bash' || normalized === 'zsh' || normalized === 'sh' || normalized === 'shellscript') return 'shell';
  if (normalized === 'yml') return 'yaml';

  return normalized;
}

function normalizeFenceLanguage(info = '') {
  const [language = ''] = info.trim().split(/\s+/, 1);
  return normalizeLanguageName(language);
}

function createAllowedLanguageSet(configuredLanguages = []) {
  return new Set(
    configuredLanguages
      .map((language) => normalizeLanguageName(language))
      .filter((language) => language !== ''),
  );
}

function parseFenceStart(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) return null;

  return {
    marker: match[1][0],
    length: match[1].length,
    info: match[2] ?? '',
  };
}

function isFenceClose(line, fence) {
  if (!fence) return false;

  const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

function parseFenceInfo(info = '') {
  let cursor = 0;
  const input = String(info ?? '');

  while (cursor < input.length && /\s/.test(input[cursor])) cursor += 1;

  const languageStart = cursor;
  while (cursor < input.length && !/\s/.test(input[cursor])) cursor += 1;

  const language = input.slice(languageStart, cursor);
  const attributes = {};

  while (cursor < input.length) {
    while (cursor < input.length && /\s/.test(input[cursor])) cursor += 1;
    if (cursor >= input.length) break;

    const keyStart = cursor;
    while (cursor < input.length && /[A-Za-z0-9_-]/.test(input[cursor])) cursor += 1;

    const key = input.slice(keyStart, cursor);
    if (!key) {
      while (cursor < input.length && !/\s/.test(input[cursor])) cursor += 1;
      continue;
    }

    while (cursor < input.length && /\s/.test(input[cursor])) cursor += 1;
    if (input[cursor] !== '=') {
      while (cursor < input.length && !/\s/.test(input[cursor])) cursor += 1;
      continue;
    }

    cursor += 1;
    while (cursor < input.length && /\s/.test(input[cursor])) cursor += 1;

    const quote = input[cursor];
    let value = '';

    if (quote === '"' || quote === "'") {
      cursor += 1;

      while (cursor < input.length) {
        const character = input[cursor];

        if (character === '\\' && cursor + 1 < input.length) {
          value += input[cursor + 1];
          cursor += 2;
          continue;
        }

        if (character === quote) {
          cursor += 1;
          break;
        }

        value += character;
        cursor += 1;
      }
    } else {
      const valueStart = cursor;
      while (cursor < input.length && !/\s/.test(input[cursor])) cursor += 1;
      value = input.slice(valueStart, cursor);
    }

    attributes[key] = value;
  }

  return {
    language,
    attributes,
  };
}

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

function inferLanguageFromPath(reference) {
  const extension = extname(reference).toLowerCase().slice(1);
  return extensionLanguageMap.get(extension) ?? '';
}

function createFenceLines(source, language) {
  const backtickRuns = String(source ?? '').match(/`+/g) ?? [];
  const longestBacktickRun = backtickRuns.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));

  return [`${fence}${language}`, ...splitContentLines(source), fence];
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

  const titleLanguage = normalizeLanguageName(link.title);
  const inferredLanguage = titleLanguage || inferLanguageFromPath(link.destination);
  if (inferredLanguage === '' || !options.allowedLanguages.has(inferredLanguage)) return null;

  const source = readExternalSource(link.destination, options);
  return createFenceLines(source, inferredLanguage);
}

export function resolveExternalCode(markdown, options = {}) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const output = [];
  const allowedLanguages = createAllowedLanguageSet(options.allowedLanguages);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const openingLineNumber = index + 1;
    const standaloneLink = parseStandaloneMarkdownLink(line);

    if (standaloneLink) {
      const resolvedLinkLines = resolveCodeLink(standaloneLink, {
        allowedLanguages,
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

    if (externalPath && language !== '' && allowedLanguages.has(language)) {
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

      output.push(line, ...splitContentLines(source), lines[cursor]);
    } else {
      if (externalPath && language !== '' && !allowedLanguages.has(language)) {
        options.onWarning?.({
          line: openingLineNumber,
          message: `external code fence for "${externalPath}" was not expanded because language "${language}" is not enabled in codeLinkLanguages.`,
        });
      }

      output.push(...blockLines);
    }

    index = cursor;
  }

  return output.join('\n');
}

export default resolveExternalCode;
