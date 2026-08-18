import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { parse, parseFragment } from 'parse5';
import { escapeHtmlAttribute } from '../core/html.mjs';
import { resolveConstrainedFilePath, resolveInputRoot } from '../core/local-path.mjs';

const require = createRequire(import.meta.url);

const BOOLEAN_ATTRIBUTES = new Set([
  'autoplay',
  'controls',
  'loop',
  'muted',
  'playsinline',
]);

const binaryMimeTypes = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
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

function applyHtmlReplacements(html, replacements) {
  return replacements
    .sort((left, right) => right.start - left.start)
    .reduce((output, replacement) => (
      `${output.slice(0, replacement.start)}${replacement.html}${output.slice(replacement.end)}`
    ), html);
}

function stripUrlSuffix(value = '') {
  return String(value ?? '').replace(/[?#].*$/u, '');
}

function isLocalRelativeReference(reference = '') {
  const value = String(reference ?? '').trim();

  if (value === '') return false;
  if (value.startsWith('#')) return false;
  if (value.startsWith('data:')) return false;
  if (value.startsWith('blob:')) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;
  if (value.startsWith('//')) return false;
  if (isAbsolute(value)) return false;

  return true;
}

function resolveLocalReference(reference, basePath) {
  return resolve(dirname(basePath), stripUrlSuffix(reference));
}

function detectAudioMimeType(filePath) {
  return binaryMimeTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream';
}

function tryInlineSpectrogramAudioSource(source, options = {}) {
  if (!isLocalRelativeReference(source)) return source;

  try {
    if (!options.markdownPath) {
      options.onWarning?.(`cannot inline spectrogram audio "${source}" because the markdown path is unavailable.`);
      return source;
    }

    const unresolvedPath = resolveLocalReference(source, options.markdownPath);
    if (!existsSync(unresolvedPath)) {
      options.onWarning?.(`spectrogram audio "${source}" was not found at "${unresolvedPath}".`);
      return source;
    }

    const filePath = resolveConstrainedFilePath(unresolvedPath, {
      allowOutsideRoot: options.allowLocalFiles === true,
      inputRoot: resolveInputRoot(options.markdownPath),
    });
    const buffer = readFileSync(filePath);
    return `data:${detectAudioMimeType(filePath)};base64,${buffer.toString('base64')}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.onWarning?.(`failed to inline spectrogram audio "${source}". ${message}`);
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
  const audioAttributes = serializeHtmlAttributes(attributes, {
    skipKeys: ['controls'],
  });
  const wavegramAttributes = {
    'data-wavegram-player': '',
  };
  if ('data-spectrogram-height' in attributes) {
    wavegramAttributes['spectrogram-height'] = parsePositiveInteger(attributes['data-spectrogram-height'], 120);
  }
  if ('data-spectrogram-fft-samples' in attributes) {
    wavegramAttributes['fft-size'] = parsePositiveInteger(attributes['data-spectrogram-fft-samples'], 1024);
  }
  const wavegramHtmlAttributes = serializeHtmlAttributes(wavegramAttributes);

  return (
    '<div class="tmu-cs-spectrogram-player" data-wavegram-spectrogram-player>' +
    `<audio${audioAttributes ? ` ${audioAttributes}` : ''}>${innerHtml}</audio>` +
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

function mediaRuntimeScript({ includeWavegram = false } = {}) {
  return `<script>${includeWavegram ? `${getWavegramBundle()}\n` : ''}
(() => {
    if (window.__tmuCsMediaEnhancementsLoaded) return;
    window.__tmuCsMediaEnhancementsLoaded = true;

    function copyDimensionStyle(el, styleText) {
      if (typeof styleText === 'string' && styleText.trim() !== '') el.style.cssText = styleText;
    }

    function resolveAudioSource(audio) {
      if (!audio) return '';
      if (audio.currentSrc) return audio.currentSrc;
      if (audio.src) return audio.src;

      const source = audio.querySelector('source[src]');
      return source ? source.src || source.getAttribute('src') || '' : '';
    }

    function drawPoster(player) {
      const src = player.dataset.gifSrc || '';
      if (!src) return;

      const canvas = player.querySelector('.tmu-cs-gif-poster');
      if (!canvas) return;

      copyDimensionStyle(canvas, player.dataset.gifStyle || '');

      const image = new Image();
      image.decoding = 'async';
      image.loading = 'eager';

      image.onload = function () {
        const width = image.naturalWidth || 1;
        const height = image.naturalHeight || 1;
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) return;

        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        player.dataset.gifPosterReady = 'true';
      };

      image.src = src;
    }

    function play(player) {
      const src = player.dataset.gifSrc || '';
      if (!src || player.dataset.gifPlaying === 'true') return;

      const template = player.querySelector('template[data-gif-image-template]');
      const image = template?.content?.firstElementChild?.cloneNode(true) || document.createElement('img');
      const alt = player.dataset.gifAlt || image.alt || '';
      const styleText = player.dataset.gifStyle || '';

      image.src = src;
      image.alt = alt;
      copyDimensionStyle(image, styleText);
      image.classList.add('tmu-cs-gif-active');
      player.removeAttribute('role');
      player.removeAttribute('aria-label');

      const canvas = player.querySelector('.tmu-cs-gif-poster');
      const button = player.querySelector('.tmu-cs-gif-play-button');
      if (canvas) canvas.hidden = true;
      if (button) button.hidden = true;

      player.appendChild(image);
      player.dataset.gifPlaying = 'true';
    }

    function init(player) {
      if (player.dataset.gifPlayerReady === 'true') return;
      player.dataset.gifPlayerReady = 'true';

      drawPoster(player);

      const button = player.querySelector('.tmu-cs-gif-play-button');
      if (button) button.addEventListener('click', function () {
        play(player);
      });
    }

    async function initSpectrogram(player) {
      if (!player || player.dataset.wavegramReady) return;

      const audio = player.querySelector('audio.wavesurfer-spectrogram');
      const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
      if (!audio || !wavegram) return;

      player.dataset.wavegramReady = 'true';

      if (!wavegram.getAttribute('src')) {
        const sourceUrl = resolveAudioSource(audio);
        if (sourceUrl) wavegram.setAttribute('src', sourceUrl);
      }
    }

    document.querySelectorAll('.tmu-cs-gif-player').forEach(init);
    document.querySelectorAll('[data-wavegram-spectrogram-player]').forEach((player) => {
      void initSpectrogram(player);
    });
  })();</script>`;
}

export default function enhanceAnimatedImages(html, options = {}) {
  const sourceHtml = String(html ?? '');
  const document = parseHtmlWithLocations(sourceHtml);
  let hasGifPlayer = false;
  let hasSpectrogramPlayer = false;
  const replacements = [];

  walkHtml(document, (node) => {
    const location = node?.sourceCodeLocation;
    if (!location || !Number.isInteger(location.startOffset) || !Number.isInteger(location.endOffset)) return;

    if (node.tagName === 'img') {
      const attributes = attributesFromNode(node);
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
      const attributes = attributesFromNode(node);
      if (!hasClassToken(attributes.class, 'wavesurfer-spectrogram')) return;

      if (typeof attributes.src === 'string' && attributes.src !== '') {
        attributes.src = tryInlineSpectrogramAudioSource(attributes.src, options);
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

  const output = applyHtmlReplacements(sourceHtml, replacements);
  const normalizedOutput = hasSpectrogramPlayer ? unwrapBlockParagraphs(output) : output;
  return hasGifPlayer || hasSpectrogramPlayer
    ? `${normalizedOutput}${mediaRuntimeScript({ includeWavegram: hasSpectrogramPlayer })}`
    : normalizedOutput;
}
