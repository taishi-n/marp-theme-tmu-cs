import assert from 'node:assert/strict';
import test from 'node:test';
import { Marp } from '@marp-team/marp-core';
import engine from '../engine.mjs';
import applyMediaPlayback, {
  normalizeMediaPlaybackMode,
  sequentialMediaPlaybackMarker,
} from '../src/pipeline/media-playback.mjs';
import recalculateAuxiliaryPagination from '../src/pipeline/auxiliary-pagination.mjs';

test('normalizeMediaPlaybackMode accepts documented values and boolean aliases', () => {
  assert.equal(normalizeMediaPlaybackMode('sequential'), 'sequential');
  assert.equal(normalizeMediaPlaybackMode(true), 'sequential');
  assert.equal(normalizeMediaPlaybackMode('off'), 'off');
  assert.equal(normalizeMediaPlaybackMode(false), 'off');
  assert.equal(normalizeMediaPlaybackMode('unexpected'), undefined);
});

test('applyMediaPlayback enables every slide and supports a local opt-out', () => {
  const markdown = [
    '---',
    'mediaPlayback: sequential',
    '---',
    '# First',
    '',
    '---',
    '',
    '<!-- _mediaPlayback: off -->',
    '# Second',
    '',
  ].join('\n');
  const output = applyMediaPlayback(markdown, { defaultMode: 'sequential' });

  assert.equal((output.match(/tmu-cs-slide-class--media-playback-sequential/gu) ?? []).length, 1);
  assert.match(output, new RegExp(`# First\\n\\n${sequentialMediaPlaybackMarker}`));
  assert.doesNotMatch(output, /_mediaPlayback/u);
  assert.match(output, /# Second/u);
});

test('applyMediaPlayback supports slide-local opt-in without changing other slides', () => {
  const markdown = [
    '# First',
    '',
    '<!-- _mediaPlayback: sequential -->',
    '',
    '---',
    '',
    '# Second',
  ].join('\n');
  const output = applyMediaPlayback(markdown);

  assert.equal((output.match(/tmu-cs-slide-class--media-playback-sequential/gu) ?? []).length, 1);
  assert.match(output, /# First[\s\S]*tmu-cs-slide-class--media-playback-sequential/u);
  assert.doesNotMatch(output.split('\n---\n').at(-1), /media-playback-sequential/u);
});

test('applyMediaPlayback ignores directive-like text inside fenced code', () => {
  const markdown = [
    '# Example',
    '',
    '```md',
    '<!-- _mediaPlayback: sequential -->',
    '```',
  ].join('\n');
  const output = applyMediaPlayback(markdown);

  assert.equal(output, markdown);
});

test('applyMediaPlayback ignores directive-like text inside a multiline comment', () => {
  const markdown = [
    '# Example',
    '',
    '<!--',
    '<!-- _mediaPlayback: sequential -->',
    '-->',
  ].join('\n');

  assert.equal(applyMediaPlayback(markdown), markdown);
});

test('applyMediaPlayback warns for invalid values without enabling playback', () => {
  const warnings = [];
  const markdown = '# Example\n';
  const output = applyMediaPlayback(markdown, {
    defaultMode: 'automatic',
    onWarning: (message) => warnings.push(message),
  });

  assert.equal(output, markdown);
  assert.deepEqual(warnings, ['Ignoring invalid mediaPlayback value "automatic".']);
});

test('applyMediaPlayback returns unrelated Markdown byte-for-byte', () => {
  const markdown = '# Example\r\n\r\nText\r\n';
  assert.equal(applyMediaPlayback(markdown), markdown);
});

test('auxiliary postprocessing promotes the playback marker to the slide section', () => {
  const html = [
    '<section id="1" class="column-layout">',
    '<p>Media</p>',
    `<p>${sequentialMediaPlaybackMarker}</p>`,
    '</section>',
  ].join('');
  const output = recalculateAuxiliaryPagination(html);

  assert.match(output, /class="column-layout media-playback-sequential"/u);
  assert.doesNotMatch(output, /tmu-cs-slide-class--media-playback-sequential/u);
});

test('engine renders deck-wide playback with a slide-local opt-out', async () => {
  const marp = await engine({ marp: new Marp() });
  const markdown = [
    '---',
    'mediaPlayback: sequential',
    '---',
    '# First',
    '',
    '<audio controls src="first.wav"></audio>',
    '',
    '---',
    '',
    '<!-- _mediaPlayback: off -->',
    '# Second',
    '',
    '<audio controls src="second.wav"></audio>',
  ].join('\n');
  const { html } = marp.render(markdown);
  const sections = html.match(/<section\b[^>]*>/gu) ?? [];

  assert.equal(sections.length, 2);
  assert.match(sections[0], /class="media-playback-sequential"/u);
  assert.doesNotMatch(sections[1], /media-playback-sequential/u);
  assert.match(html, /function playNextStep\(section\)/u);
});
