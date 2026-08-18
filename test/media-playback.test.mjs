import assert from 'node:assert/strict';
import test from 'node:test';
import { Marp } from '@marp-team/marp-core';
import engine from '../engine.mjs';
import installMediaPlayback, {
  normalizeMediaPlaybackMode,
} from '../src/pipeline/media-playback.mjs';

test('normalizeMediaPlaybackMode normalizes supported modes and rejects aliases', () => {
  assert.equal(normalizeMediaPlaybackMode('sequential'), 'sequential');
  assert.equal(normalizeMediaPlaybackMode(' Sequential '), 'sequential');
  assert.equal(normalizeMediaPlaybackMode('off'), 'off');
  assert.equal(normalizeMediaPlaybackMode(true), undefined);
  assert.equal(normalizeMediaPlaybackMode('on'), undefined);
  assert.equal(normalizeMediaPlaybackMode('unexpected'), undefined);
});

test('engine enables deck-wide playback with a slide-local opt-out', async () => {
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
  assert.match(sections[0], /data-media-playback="sequential"/u);
  assert.doesNotMatch(sections[1], /data-media-playback/u);
});

test('grouped Marp directives preserve slide classes and local playback', async () => {
  const marp = await engine({ marp: new Marp() });
  const markdown = [
    '<!--',
    '_class: column-layout',
    '_mediaPlayback: sequential',
    '-->',
    '',
    '# Media',
    '',
    '<audio controls src="example.wav"></audio>',
  ].join('\n');
  const { html } = marp.render(markdown);
  const section = html.match(/<section\b[^>]*>/u)?.[0] ?? '';

  assert.match(section, /class="column-layout"/u);
  assert.match(section, /data-media-playback="sequential"/u);
});

test('section-page expansion carries a leading local directive to the content slide', async () => {
  const marp = await engine({ marp: new Marp() });
  const markdown = [
    '---',
    'sectionPages: true',
    'sectionPageLevel: 2',
    '---',
    '<!--',
    '_class: column-layout',
    '_mediaPlayback: sequential',
    '-->',
    '## Audio',
    '',
    '<audio controls src="example.wav"></audio>',
  ].join('\n');
  const { html } = marp.render(markdown);
  const sections = html.match(/<section\b[^>]*>/gu) ?? [];

  assert.equal(sections.length, 2);
  assert.doesNotMatch(sections[0], /data-media-playback/u);
  assert.match(sections[1], /class="column-layout"/u);
  assert.match(sections[1], /data-media-playback="sequential"/u);
});

test('directive-like text inside fenced code does not enable playback', async () => {
  const marp = await engine({ marp: new Marp() });
  const markdown = [
    '# Example',
    '',
    '```md',
    '<!-- _mediaPlayback: sequential -->',
    '```',
  ].join('\n');
  const { html } = marp.render(markdown);

  assert.doesNotMatch(html, /data-media-playback="sequential"/u);
});

test('invalid mediaPlayback values warn and leave playback disabled', () => {
  const warnings = [];
  const marp = new Marp();
  installMediaPlayback(marp, {
    onWarning: (message) => warnings.push(message),
  });
  const { html } = marp.render([
    '---',
    'mediaPlayback: automatic',
    '---',
    '# Example',
  ].join('\n'));

  assert.doesNotMatch(html, /data-media-playback/u);
  assert.deepEqual(warnings, [
    'Ignoring invalid mediaPlayback value "automatic". Use "sequential" or "off".',
  ]);
});
