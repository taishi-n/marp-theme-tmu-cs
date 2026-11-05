import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parse, parseFragment } from 'parse5';
import { escapeHtmlAttribute, replaceHtmlRanges } from '../core/html.mjs';
import { mediaRuntimeScript } from './media-runtime.mjs';
import { createAssetContext, loadAsset, resolveReference, toDataUrl } from './asset-loader.mjs';

const require = createRequire(import.meta.url);

const BOOLEAN_ATTRIBUTES = new Set([
  'autoplay',
  'controls',
  'loop',
  'muted',
  'playsinline',
]);

let wavegramBundleCache;

function getWavegramBundle() {
  if (wavegramBundleCache === undefined) {
    const bundle = readFileSync(require.resolve('wavegram'), 'utf8');
    // The published component already contains a no-Worker fallback. Shadowing
    // Worker activates that supported path without rewriting minified source.
    wavegramBundleCache = `(function (Worker) {\n${bundle}\n})(undefined);`;
  }

  return wavegramBundleCache;
}

function parsePositiveInteger(value, fallbackValue) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function serializeHtmlAttributes(attributes, { skipKeys = [] } = {}) {
  return Object.entries(attributes)
    .filter(([key]) => !skipKeys.includes(key))
    .map(([key, value]) => {
      if (value === '' && BOOLEAN_ATTRIBUTES.has(key)) return key;
      return `${key}="${escapeHtmlAttribute(value)}"`;
    })
    .join(' ');
}

function hasClassToken(className, token) {
  return String(className ?? '')
    .split(/\s+/u)
    .filter(Boolean)
    .includes(token);
}

function parseHtmlWithLocations(html) {
  const options = { sourceCodeLocationInfo: true };
  return /<(?:!doctype\s+html|html)\b/iu.test(html)
    ? parse(html, options)
    : parseFragment(html, options);
}

function attributesFromNode(node) {
  return Object.fromEntries((node?.attrs ?? []).map((attribute) => [attribute.name, attribute.value]));
}

function walkHtml(node, visit) {
  visit(node);
  for (const child of node?.childNodes ?? []) walkHtml(child, visit);
}

function tryInlineSpectrogramAudioSource(source, options, context) {
  if (resolveReference(source, context.basePath)?.kind !== 'local') return source;
  if (!options.markdownPath) {
    options.onWarning?.(`cannot inline spectrogram audio "${source}" because the markdown path is unavailable.`);
    return source;
  }
  try {
    const asset = loadAsset(source, context);
    return asset ? toDataUrl(source, asset) : source;
  } catch (error) {
    options.onWarning?.(error.cause?.code === 'ENOENT'
      ? `spectrogram audio "${source}" was not found.`
      : `failed to inline spectrogram audio "${source}". ${error.message}`);
    return source;
  }
}

function createAnimatedImagePlayerHtml(attributes) {
  const src = attributes.src ?? '';
  const alt = attributes.alt ?? '';
  const style = attributes.style ?? '';
  const width = attributes.width ?? '';
  const height = attributes.height ?? '';
  const wrapperAttributes = Object.fromEntries(Object.entries(attributes).filter(([key]) => (
    key === 'id' || key === 'title' || key.startsWith('aria-') || key.startsWith('data-')
  )));
  wrapperAttributes.class = ['tmu-cs-gif-player', attributes.class].filter(Boolean).join(' ');
  wrapperAttributes['data-gif-src'] = src;
  wrapperAttributes['data-gif-alt'] = alt;
  wrapperAttributes['data-gif-style'] = style || [width ? `width:${width}px;` : '', height ? `height:${height}px;` : '']
    .filter(Boolean)
    .join(' ');
  wrapperAttributes.role ??= 'group';
  if (alt && !wrapperAttributes['aria-label']) wrapperAttributes['aria-label'] = alt;

  const imageTemplateAttributes = { ...attributes };
  delete imageTemplateAttributes.id;
  delete imageTemplateAttributes.src;
  const serializedWrapperAttributes = serializeHtmlAttributes(wrapperAttributes);
  const serializedImageAttributes = serializeHtmlAttributes(imageTemplateAttributes);

  return (
    `<span${serializedWrapperAttributes ? ` ${serializedWrapperAttributes}` : ''}>` +
    `<canvas class="tmu-cs-gif-poster" aria-hidden="true"></canvas>` +
    `<button type="button" class="tmu-cs-gif-play-button" aria-label="Play animation">` +
    `<svg class="tmu-cs-gif-play-icon" viewBox="0 0 384 512" aria-hidden="true" focusable="false">` +
    `<path fill="currentColor" d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 53.3 0 70.5v371c0 17.2 9.4 33 24.5 41.9s33.7 8.4 48.5-.7l288-186c14.6-9.4 23.5-25.7 23.5-43s-8.9-33.6-23.5-43L73 39z"/>` +
    `</svg>` +
    `</button>` +
    `<template data-gif-image-template><img${serializedImageAttributes ? ` ${serializedImageAttributes}` : ''}></template>` +
    `</span>`
  );
}

function createSpectrogramAudioPlayerHtml(attributes, innerHtml = '') {
  const audioAttributes = serializeHtmlAttributes({ ...attributes, preload: 'none' }, {
    skipKeys: ['controls'],
  });
  const wavegramAttributes = {
    'data-wavegram-player': '',
    rendering: 'suspended',
    'color-map': 'magma',
  };
  if ('data-spectrogram-height' in attributes) {
    wavegramAttributes['spectrogram-height'] = parsePositiveInteger(attributes['data-spectrogram-height'], 120);
  }
  if ('data-spectrogram-fft-samples' in attributes) {
    wavegramAttributes['fft-size'] = parsePositiveInteger(attributes['data-spectrogram-fft-samples'], 1024);
  }
  for (const name of ['height', 'waveform-height', 'spectrogram-height', 'fft-size', 'hop-size',
    'window-type', 'min-db', 'max-db', 'color-map', 'channel', 'show-waveform',
    'show-spectrogram', 'show-controls', 'show-time']) {
    const key = 'data-wavegram-' + name;
    if (key in attributes) wavegramAttributes[name] = attributes[key];
  }
  const wavegramHtmlAttributes = serializeHtmlAttributes(wavegramAttributes);
  const hasDownload = 'data-audio-download' in attributes;
  const row = hasDownload || 'data-audio-label' in attributes;
  const label = attributes['data-audio-label'] ?? '';
  const download = hasDownload
    ? `<a class="tmu-cs-audio-download" data-audio-download-link download="${escapeHtmlAttribute(attributes['data-audio-download'])}" aria-label="${escapeHtmlAttribute(`Download ${label || 'audio'}`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" fill="none" stroke="currentColor" stroke-width="2"/></svg></a>`
    : '';
  const rowLabel = row ? `<span class="tmu-cs-audio-label">${escapeHtmlAttribute(label)}</span>` : '';

  return (
    `<div class="tmu-cs-spectrogram-player${row ? ' tmu-cs-audio-row' : ''}" data-wavegram-spectrogram-player>` +
    `<audio${audioAttributes ? ` ${audioAttributes}` : ''}>${innerHtml}</audio>` +
    download + rowLabel +
    `<wavegram-player${wavegramHtmlAttributes ? ` ${wavegramHtmlAttributes}` : ''}></wavegram-player>` +
    '</div>'
  );
}

function unwrapBlockParagraphs(html) {
  return String(html ?? '').replace(
    /<p>\s*(<div class="tmu-cs-spectrogram-player"[\s\S]*?<\/div>)\s*<\/p>/giu,
    '$1',
  );
}

export default function enhanceAnimatedImages(html, options = {}) {
  const sourceHtml = String(html ?? '');
  if (!/(?:<img\b[^>]*\.gif(?:[?#]|[\s"'])|<audio\b|data-media-playback=["']sequential["'])/iu.test(sourceHtml)) return sourceHtml;
  const document = parseHtmlWithLocations(sourceHtml);
  const assetContext = createAssetContext(options.markdownPath ?? resolve('slides.md'), options);
  let hasGifPlayer = false;
  let hasSpectrogramPlayer = false;
  let hasSequentialPlayback = false;
  const replacements = [];

  walkHtml(document, (node) => {
    const location = node?.sourceCodeLocation;
    if (!location || !Number.isInteger(location.startOffset) || !Number.isInteger(location.endOffset)) return;

    const nodeAttributes = attributesFromNode(node);
    if (node.tagName === 'section' && nodeAttributes['data-media-playback'] === 'sequential') {
      hasSequentialPlayback = true;
    }

    if (node.tagName === 'img') {
      const attributes = nodeAttributes;
      const source = attributes.src ?? '';

      if (!/\.gif(?:[?#].*)?$/iu.test(source) || 'data-marp-twemoji' in attributes) return;

      hasGifPlayer = true;
      replacements.push({
        end: location.endOffset,
        html: createAnimatedImagePlayerHtml(attributes),
        start: location.startOffset,
      });
      return;
    }

    if (node.tagName === 'audio') {
      const attributes = nodeAttributes;
      if (!hasClassToken(attributes.class, 'wavesurfer-spectrogram')) return;

      if (typeof attributes.src === 'string' && attributes.src !== '') {
        attributes.src = tryInlineSpectrogramAudioSource(attributes.src, options, assetContext);
      }

      const innerStart = location.startTag?.endOffset;
      const innerEnd = location.endTag?.startOffset;
      const innerHtml = Number.isInteger(innerStart) && Number.isInteger(innerEnd)
        ? sourceHtml.slice(innerStart, innerEnd)
        : '';
      hasSpectrogramPlayer = true;
      replacements.push({
        end: location.endOffset,
        html: createSpectrogramAudioPlayerHtml(attributes, innerHtml),
        start: location.startOffset,
      });
    }
  });

  const output = replaceHtmlRanges(sourceHtml, replacements);
  const normalizedOutput = hasSpectrogramPlayer ? unwrapBlockParagraphs(output) : output;
  return hasGifPlayer || hasSpectrogramPlayer || hasSequentialPlayback
    ? `${normalizedOutput}${mediaRuntimeScript({ gif: hasGifPlayer, spectrogram: hasSpectrogramPlayer, sequential: hasSequentialPlayback, wavegramBundle: hasSpectrogramPlayer ? getWavegramBundle() : '' })}`
    : normalizedOutput;
}
