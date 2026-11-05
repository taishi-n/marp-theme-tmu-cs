import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadThemeOverrides } from '../src/pipeline/theme-overrides.mjs';
import { findElements, parseFragment, textContent } from '../test-support/html.mjs';

test('CSS overrides preserve order and resolve assets relative to each stylesheet', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tmu-cs-css-'));
  try {
    await writeFile(join(root, 'figure.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(join(root, 'first.css'), '.one {background: url("figure.svg");}');
    await writeFile(join(root, 'second.css'), '.two {color: red;}');
    const css = loadThemeOverrides([join(root, 'first.css'), join(root, 'second.css')]);
    assert.ok(css.indexOf('.one') < css.indexOf('.two'));
    const payload = css.match(/data:image\/svg\+xml;base64,([^")]+)/)?.[1];
    assert.equal(Buffer.from(payload, 'base64').toString(), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(join(root, 'import.css'), '@import "theme.css";');
    assert.throws(() => loadThemeOverrides([join(root, 'import.css')]), /without @theme or @import/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the CLI keeps composed overrides instead of replacing them with its default theme-set', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tmu-cs-css-cli-'));
  try {
    const source = join(root, 'slides.md');
    const stylesheet = join(root, 'slide.css');
    const output = join(root, 'slides.html');
    await writeFile(source, '---\ntheme: tmu-cs\n---\n# Example');
    await writeFile(stylesheet, 'section { --override-contract: preserved; }');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/marp-tmu-cs.mjs', import.meta.url)), '--theme-overrides', stylesheet, source, '-o', output], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    const styles = findElements(parseFragment(await readFile(output, 'utf8')), node => node.tagName === 'style');
    assert.ok(styles.some(style => /--override-contract:\s*preserved/u.test(textContent(style))), 'composed overrides reach an emitted stylesheet');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
