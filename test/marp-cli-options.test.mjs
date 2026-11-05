import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseThemeOptions } from '../scripts/theme-options.mjs';

test('wrapper metadata options preserve Marp arguments and positional terminators', () => {
  const options = parseThemeOptions(['--edit-labels', '--slide-index=dist/index.json', 'slides.md', '-o', 'dist/deck.html', '--', '--standalone']);
  assert.equal(options.editLabels, true);
  assert.equal(options.slideIndex, 'dist/index.json');
  assert.equal(options.standalone, false);
  assert.deepEqual(options.args, ['slides.md', '-o', 'dist/deck.html', '--', '--standalone']);
  assert.throws(() => parseThemeOptions(['--slide-index', '--pdf']), /requires an output path/);
  assert.deepEqual(parseThemeOptions(['--theme-overrides', 'first.css', '--theme-overrides=second.css', 'slides.md']).themeOverrides, ['first.css', 'second.css']);
});
import { enginePath, themePath } from '../index.mjs';
import { applyTmuCsDefaults, detectOutputFormat } from '../scripts/marp-cli-options.mjs';

test('applyTmuCsDefaults injects engine and theme-set when omitted', () => {
  assert.deepEqual(
    applyTmuCsDefaults(['slides.md', '-o', 'slides.html']),
    ['slides.md', '-o', 'slides.html', '--engine', enginePath, '--theme-set', themePath],
  );
});

test('applyTmuCsDefaults preserves explicit engine and theme-set values', () => {
  assert.deepEqual(
    applyTmuCsDefaults([
      '--engine',
      '/tmp/custom-engine.mjs',
      '--theme-set=/tmp/custom-theme.css',
      'slides.md',
    ]),
    ['--engine', '/tmp/custom-engine.mjs', '--theme-set=/tmp/custom-theme.css', 'slides.md'],
  );
});

test('applyTmuCsDefaults inserts defaults before the option terminator', () => {
  assert.deepEqual(
    applyTmuCsDefaults(['slides.md', '--', '--literal-file.md']),
    ['slides.md', '--engine', enginePath, '--theme-set', themePath, '--', '--literal-file.md'],
  );
});

test('detectOutputFormat recognizes flags and output extensions before the terminator', () => {
  assert.equal(detectOutputFormat(['slides.md', '--images']), 'images');
  assert.equal(detectOutputFormat(['slides.md', '-o', 'slides.pptx']), 'pptx');
  assert.equal(detectOutputFormat(['slides.md', '-o', 'slides.png']), 'image');
  assert.equal(detectOutputFormat(['slides.md', '--', '--pdf']), 'html');
});

test('format selection follows Marp flag, configuration, extension and dependent-option precedence', () => {
  /** @type {Array<[string[], object, string]>} */
  const cases = [
    [[], { pdf: true }, 'pdf'],
    [['--no-pdf'], { pdf: true }, 'pdf'],
    [['--notes', '--image=png'], {}, 'notes'],
    [['--pdf-outlines'], {}, 'pdf'],
    [[], { pdfOutlines: { pages: false, headings: false } }, 'html'],
    [[], { pdfOutlines: true, output: 'slides.html' }, 'html'],
    [[], { pptxEditable: true }, 'pptx'],
    [['--no-pptx'], { pptxEditable: true }, 'html'],
  ];
  for (const [args, config, expected] of cases) assert.equal(detectOutputFormat(args, config), expected);
});

test('standalone format restrictions also apply to formats selected by a config file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tmu-cs-config-format-'));
  const wrapper = fileURLToPath(new URL('../scripts/marp-tmu-cs.mjs', import.meta.url));
  const packageUrl = new URL('../index.mjs', import.meta.url).href;
  try {
    await writeFile(join(root, 'slides.md'), '# Slide');
    for (const settings of [{}, { pdf: true }, { pptx: true }, { notes: true }, { pdfOutlines: true }]) {
      await writeFile(join(root, 'marp.config.mjs'), `import { defineTmuCsConfig } from ${JSON.stringify(packageUrl)};\nexport default defineTmuCsConfig(${JSON.stringify(settings)});\n`);
      const run = spawnSync(process.execPath, [wrapper, '--standalone', '--config-file', 'marp.config.mjs', 'slides.md'], {
        cwd: root, encoding: 'utf8', timeout: 30000,
      });
      if (Object.keys(settings).length === 0) assert.equal(run.status, 0, run.stderr);
      else {
        assert.notEqual(run.status, 0);
        assert.match(run.stderr, /standalone is supported only\s+for HTML/u);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
