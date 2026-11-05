import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import * as pkg from 'marp-theme-tmu-cs';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const runFile = promisify(execFile);
const entrypoints = ['engine', 'engine.mjs', 'theme', 'theme.css', 'theme/tmu-cs.css', 'csl/ieee.csl'];

test('the package root provides the engine and bundled asset paths', () => {
  assert.equal(pkg.themeName, 'tmu-cs');
  assert.equal(typeof pkg.marpEngine, 'function');
  assert.equal(typeof pkg.defineTmuCsConfig, 'function');
  for (const path of [pkg.enginePath, pkg.themePath, pkg.defaultCslPath]) assert.equal(typeof path, 'string');
});

test('package exports expose canonical entrypoints and compatibility aliases', async () => {
  for (const entrypoint of ['engine', 'engine.mjs']) {
    const specifier = `marp-theme-tmu-cs/${entrypoint}`;
    assert.equal((await import(specifier)).default, pkg.marpEngine);
    assert.equal(fileURLToPath(import.meta.resolve(specifier)), pkg.enginePath);
  }
  for (const entrypoint of ['theme', 'theme.css', 'theme/tmu-cs.css']) {
    const path = fileURLToPath(import.meta.resolve(`marp-theme-tmu-cs/${entrypoint}`));
    assert.equal(path, pkg.themePath);
    assert.match(await readFile(path, 'utf8'), /@theme tmu-cs/u);
  }
  const cslPath = fileURLToPath(import.meta.resolve('marp-theme-tmu-cs/csl/ieee.csl'));
  assert.equal(cslPath, pkg.defaultCslPath);
  assert.match(await readFile(cslPath, 'utf8'), /<style\b/u);
});

test('the npm package includes public entrypoints, documentation, assets and working CLIs', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const tempDir = await mkdtemp(join(tmpdir(), 'tmu-cs-package-'));
  try {
    const pack = await runFile(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'pack', '--offline', '--json', '--ignore-scripts', '--pack-destination', tempDir, '--cache', join(tempDir, 'cache'),
    ], { cwd: packageRoot, encoding: 'utf8', timeout: 30000 });
    const [manifest] = JSON.parse(pack.stdout);
    const files = new Set(manifest.files.map(file => file.path));
    const publicPaths = ['', ...entrypoints.map(entrypoint => `/${entrypoint}`)]
      .map(suffix => relative(packageRoot, fileURLToPath(import.meta.resolve(`marp-theme-tmu-cs${suffix}`))));
    for (const path of [
      ...publicPaths, 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
      'docs/theme-styling.md', 'docs/feature-guide.md', 'docs/media-playback.md', 'docs/development.md',
    ]) assert.ok(files.has(path), `Missing packaged file ${path}`);

    for (const name of ['marp-tmu-cs', 'marp-tmu-cs-check']) {
      const target = packageJson.bin[name];
      assert.equal(typeof target, 'string');
      assert.ok(files.has(target), `Missing binary ${name}: ${target}`);
      assert.match(await readFile(join(packageRoot, target), 'utf8'), /^#!\/usr\/bin\/env node\b/u);
      const help = await runFile(process.execPath, [join(packageRoot, target), '--help'], {
        cwd: tempDir, encoding: 'utf8', timeout: 30000,
      });
      assert.match(help.stdout, /Usage:/iu);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
