#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { applyTmuCsDefaults, detectOutputFormat, findOutputPath } from './marp-cli-options.mjs';
import { parseThemeOptions } from './theme-options.mjs';

const require = createRequire(import.meta.url);
const marpCliPath = require.resolve('@marp-team/marp-cli/marp-cli.js');
let themeOptions;
try {
  themeOptions = parseThemeOptions(process.argv.slice(2));
} catch (error) {
  console.error(`[tmu-cs] ${error.message}`);
  process.exit(1);
}
const { standalone } = themeOptions;
if (themeOptions.themeOverrides.length && themeOptions.args.some((arg) => arg === '--theme-set' || arg.startsWith('--theme-set='))) {
  console.error('[tmu-cs] choose --theme-overrides for the bundled theme or --theme-set for a complete custom theme.');
  process.exit(1);
}
const forwardedArgs = applyTmuCsDefaults(themeOptions.args, { themeSet: themeOptions.themeOverrides.length === 0 });
const outputFormat = detectOutputFormat(forwardedArgs);

if (standalone && outputFormat !== 'html') {
  console.error('[tmu-cs] --standalone is supported only for HTML output.');
  process.exit(1);
}

const outputArgument = findOutputPath(forwardedArgs);
const standaloneOutputPath = standalone && outputArgument
  ? resolve(process.cwd(), outputArgument)
  : undefined;
const allowLocalFiles = forwardedArgs.includes('--allow-local-files');

function findMarkdownInputs(args) {
  const optionsWithValues = new Set([
    '--config-file', '--engine', '--input-dir', '--output', '--theme', '--theme-set', '-I', '-o',
  ]);
  const candidates = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (optionsWithValues.has(argument)) {
      index += 1;
      continue;
    }
    if (argument.startsWith('-') || !/\.md$/iu.test(argument)) continue;
    const candidate = resolve(process.cwd(), argument);
    if (existsSync(candidate)) candidates.push(candidate);
  }

  return Array.from(new Set(candidates));
}

const markdownInputs = findMarkdownInputs(forwardedArgs);
const help = forwardedArgs.includes('--help') || forwardedArgs.includes('-h');
if (themeOptions.slideIndex && markdownInputs.length !== 1 && !help) {
  console.error('[tmu-cs] --slide-index requires exactly one explicit Markdown input.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [marpCliPath, ...forwardedArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...(standalone ? {
      TMU_CS_STANDALONE: '1',
      ...(standaloneOutputPath ? { TMU_CS_STANDALONE_OUTPUT: standaloneOutputPath } : {}),
    } : {}),
    ...(allowLocalFiles ? { TMU_CS_ALLOW_LOCAL_FILES: '1' } : {}),
    ...(markdownInputs.length > 0 ? { TMU_CS_MARKDOWN_PATHS: JSON.stringify(markdownInputs) } : {}),
    TMU_CS_OUTPUT_FORMAT: outputFormat,
    ...(themeOptions.editLabels ? { TMU_CS_EDIT_LABELS: '1' } : {}),
    ...(themeOptions.slideIndex ? { TMU_CS_SLIDE_INDEX: resolve(themeOptions.slideIndex) } : {}),
    ...(themeOptions.themeOverrides.length ? { TMU_CS_THEME_OVERRIDES: JSON.stringify(themeOptions.themeOverrides.map((path) => resolve(path))) } : {}),
  },
});

if (result.error) {
  console.error(result.error instanceof Error ? result.error.message : String(result.error));
  process.exit(1);
}

if (help && result.status === 0) {
  console.log('\nTMU-CS options:\n  --standalone              Embed HTML assets\n  --edit-labels             Show edit IDs in HTML\n  --slide-index <path>      Write a source-to-slide JSON index\n  --theme-overrides <css>   Apply additional CSS (repeatable)');
}

process.exit(result.status ?? 1);
