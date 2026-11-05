#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { checkDeck } from '../src/pipeline/check-deck.mjs';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: marp-tmu-cs-check <slides.html> [--index <slide-index.json>] [--output <report.json>] [--standalone]');
} else {
  try {
    let htmlPath;
    let indexPath;
    let output;
    let standalone = false;
    for (let offset = 0; offset < args.length; offset += 1) {
      const arg = args[offset];
      if (arg === '--standalone') standalone = true;
      else if (['--index', '--output'].includes(arg)) {
        const value = args[++offset];
        if (!value || value.startsWith('-')) throw new Error(`${arg} requires a path.`);
        if (arg === '--index') indexPath = value;
        else output = value;
      } else if (!arg.startsWith('-') && !htmlPath) htmlPath = arg;
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!htmlPath) throw new Error('An HTML file is required.');
    const report = checkDeck(readFileSync(htmlPath, 'utf8'), {
      htmlPath: resolve(htmlPath), standalone,
      index: indexPath ? JSON.parse(readFileSync(indexPath, 'utf8')) : undefined,
    });
    if (output) {
      mkdirSync(dirname(resolve(output)), { recursive: true });
      writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`[tmu-cs] ${report.ok ? 'OK' : 'FAILED'}: ${report.slideCount} slides; ${report.diagnostics.length} static errors. Visual review not performed.`);
    } else console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.error(`[tmu-cs] ${error.message}`);
    process.exitCode = 1;
  }
}
