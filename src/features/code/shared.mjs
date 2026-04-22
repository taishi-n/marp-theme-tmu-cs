import { extname } from 'node:path';

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

export const supportedShikiLanguages = [
  'c',
  'cpp',
  'csharp',
  'css',
  'fsharp',
  'go',
  'haskell',
  'html',
  'java',
  'javascript',
  'json',
  'jsx',
  'kotlin',
  'lua',
  'perl',
  'php',
  'python',
  'r',
  'ruby',
  'rust',
  'scala',
  'shell',
  'sql',
  'swift',
  'toml',
  'typescript',
  'tsx',
  'yaml',
];

const lineCommentPrefixesByLanguage = new Map([
  ['c', '//'],
  ['cpp', '//'],
  ['csharp', '//'],
  ['fsharp', '//'],
  ['go', '//'],
  ['java', '//'],
  ['javascript', '//'],
  ['jsx', '//'],
  ['kotlin', '//'],
  ['lua', '--'],
  ['perl', '#'],
  ['php', '//'],
  ['python', '#'],
  ['r', '#'],
  ['ruby', '#'],
  ['rust', '//'],
  ['scala', '//'],
  ['shell', '#'],
  ['sql', '--'],
  ['swift', '//'],
  ['toml', '#'],
  ['typescript', '//'],
  ['tsx', '//'],
  ['yaml', '#'],
]);

export function normalizeCodeLanguage(language = '') {
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

export function normalizeFenceLanguage(info = '') {
  const [language = ''] = String(info ?? '').trim().split(/\s+/, 1);
  return normalizeCodeLanguage(language);
}

export function isShikiLanguageSupported(language = '') {
  return supportedShikiLanguages.includes(normalizeCodeLanguage(language));
}

export function getLineCommentPrefix(language = '') {
  return lineCommentPrefixesByLanguage.get(normalizeCodeLanguage(language)) ?? null;
}

export function supportsMagicComments(language = '') {
  return getLineCommentPrefix(language) !== null;
}

export function parseFenceInfo(info = '') {
  let cursor = 0;
  const input = String(info ?? '');

  while (cursor < input.length && /\s/.test(input[cursor])) cursor += 1;

  const languageStart = cursor;
  while (cursor < input.length && !/\s/.test(input[cursor])) cursor += 1;

  let language = input.slice(languageStart, cursor);
  if (language.includes('=')) {
    language = '';
    cursor = languageStart;
  }
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
      attributes[key] = 'true';
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

  return { language, attributes };
}

export function inferLanguageFromPath(reference) {
  const extension = extname(reference).toLowerCase().slice(1);
  return extensionLanguageMap.get(extension) ?? '';
}
