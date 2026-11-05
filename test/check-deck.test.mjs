import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkDeck } from '../src/pipeline/check-deck.mjs';

test('static checks attribute missing assets, unresolved citations, and math errors to source slides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tmu-cs-check-'));
  try {
    await writeFile(join(root, 'present.svg'), '<svg/>');
    const html = '<section data-slide-id="result" data-source-line="12"><img src="present.svg"><img src="missing.svg"><p>[@missing]</p><code>[@example]</code><svg data-mml-node="merror"></svg></section>';
    const report = checkDeck(html, { htmlPath: join(root, 'slides.html') });
    assert.equal(report.ok, false);
    assert.deepEqual(report.diagnostics.map((item) => item.code).sort(), ['MATH_ERROR', 'MISSING_ASSET', 'UNRESOLVED_CITATION']);
    assert.ok(report.diagnostics.every((item) => item.slideId === 'result' && item.sourceLine === 12));
    assert.equal(report.visualReview, 'not-performed');
  } finally { await rm(root, { force: true, recursive: true }); }
});

test('static checks distinguish portable assets, matching indexes, and nested content sections', () => {
  const html = '<section data-slide-id="one"><section>Nested content</section><img src="data:image/svg+xml;base64,AA=="></section>';
  const index = { version: 1, slides: [{ id: 'one', physicalPage: 1 }] };
  assert.equal(checkDeck(html, { index, standalone: true }).ok, true);
  assert.equal(checkDeck(html, { index }).slideCount, 1);
  assert.equal(checkDeck(html, { index: { ...index, slides: [] } }).ok, false);
  assert.equal(checkDeck(html, { index: { version: 1, slides: [{ id: 'one', physicalPage: 1, sourceLine: 99 }] } }).diagnostics[0].code, 'INDEX_METADATA');
  const remote = checkDeck('<section><img src="https://example.test/a.svg"></section>', { standalone: true });
  assert.equal(remote.diagnostics[0].code, 'EXTERNAL_ASSET');
});
