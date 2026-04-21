#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const marpCliPath = require.resolve('@marp-team/marp-cli/marp-cli.js');
const rawArgs = process.argv.slice(2);
const standalone = rawArgs.includes('--standalone');
const forwardedArgs = rawArgs.filter((arg) => arg !== '--standalone');

function findOutputPath(args) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '-o' || argument === '--output') {
      const next = args[index + 1];
      return typeof next === 'string' && next !== '' ? resolve(process.cwd(), next) : undefined;
    }

    if (argument.startsWith('--output=')) {
      return resolve(process.cwd(), argument.slice('--output='.length));
    }
  }

  return undefined;
}

if (standalone && forwardedArgs.some((arg) => arg === '--pdf' || arg === '--pptx')) {
  console.error('[tmu-cs] --standalone is supported only for HTML output.');
  process.exit(1);
}

const standaloneOutputPath = standalone ? findOutputPath(forwardedArgs) : undefined;

const result = spawnSync(process.execPath, [marpCliPath, ...forwardedArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...(standalone ? {
      TMU_CS_STANDALONE: '1',
      ...(standaloneOutputPath ? { TMU_CS_STANDALONE_OUTPUT: standaloneOutputPath } : {}),
    } : {}),
  },
});

if (result.error) {
  console.error(result.error instanceof Error ? result.error.message : String(result.error));
  process.exit(1);
}

process.exit(result.status ?? 1);
