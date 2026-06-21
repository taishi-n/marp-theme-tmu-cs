import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { escapeHtmlAttribute } from '../core/html.mjs';

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
    const standaloneBundle = bundle.replace(
      /return typeof Worker>"u"\?Promise\.resolve\(_\(t,this\.audioBuffer\.sampleRate,r\)\):new Promise\(\(i,o\)=>\{.*?\}\)\\?\}bindAudio/s,
      'return Promise.resolve(_(t,this.audioBuffer.sampleRate,r))}bindAudio',
    );

    if (standaloneBundle === bundle) {
      throw new Error('Failed to adapt wavegram bundle for standalone HTML output.');
    }

    wavegramBundleCache = standaloneBundle;
  }

  return wavegramBundleCache;
}

function parsePositiveInteger(value, fallbackValue) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function parseHtmlAttributes(input = '') {
  const attributes = {};

  for (const match of String(input ?? '').matchAll(/([^\s=\/>]+)(?:\s*=\s*"([^"]*)")?/g)) {
    const key = match[1];
    if (!key) continue;
    attributes[key] = match[2] ?? '';
  }

  return attributes;
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

function normalizeWorkspaceSuffix(reference = '') {
  return stripUrlSuffix(reference)
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/');
}

function findWorkspaceAsset(reference, currentDir = process.cwd()) {
  const normalizedReference = normalizeWorkspaceSuffix(reference);
  const fileName = normalizedReference.split('/').pop();
  if (!fileName) return undefined;

  const skippedDirectories = new Set(['.git', 'node_modules']);
  const matches = [];

  const walk = (directory, relativeDirectory = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skippedDirectories.has(entry.name)) continue;

        const nextRelative = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
        walk(resolve(directory, entry.name), nextRelative);
        continue;
      }

      if (!entry.isFile() || entry.name !== fileName) continue;

      const relativeFile = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (
        relativeFile === normalizedReference
        || relativeFile.endsWith(`/${normalizedReference}`)
        || entry.name === fileName
      ) {
        matches.push(resolve(directory, entry.name));
      }
    }
  };

  walk(currentDir);
  return matches.length === 1 ? matches[0] : undefined;
}

function detectAudioMimeType(filePath) {
  return binaryMimeTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream';
}

function tryInlineSpectrogramAudioSource(source, options = {}) {
  if (!isLocalRelativeReference(source)) return source;

  try {
    let filePath;

    if (options.markdownPath) {
      const markdownRelativePath = resolveLocalReference(source, options.markdownPath);
      if (existsSync(markdownRelativePath)) filePath = markdownRelativePath;
    }

    if (!filePath) {
      const searchRoot = options.markdownPath ? dirname(options.markdownPath) : process.cwd();
      filePath = findWorkspaceAsset(source, searchRoot);
    }
    if (!filePath) return source;

    const buffer = readFileSync(filePath);
    return `data:${detectAudioMimeType(filePath)};base64,${buffer.toString('base64')}`;
  } catch (error) {
    return source;
  }
}

function createAnimatedImagePlayerHtml(attributes) {
  const src = attributes.src ?? '';
  const alt = attributes.alt ?? '';
  const style = attributes.style ?? '';
  const width = attributes.width ?? '';
  const height = attributes.height ?? '';
  const className = attributes.class ?? '';

  const posterStyle = style || [width ? `width:${width}px;` : '', height ? `height:${height}px;` : '']
    .filter(Boolean)
    .join(' ');

  return (
    `<span class="tmu-cs-gif-player" data-gif-src="${escapeHtmlAttribute(src)}" data-gif-alt="${escapeHtmlAttribute(alt)}"` +
    ` data-gif-style="${escapeHtmlAttribute(posterStyle)}" data-gif-class="${escapeHtmlAttribute(className)}">` +
    `<canvas class="tmu-cs-gif-poster" aria-hidden="true"></canvas>` +
    `<button type="button" class="tmu-cs-gif-play-button" aria-label="Play animation">` +
    `<svg class="tmu-cs-gif-play-icon" viewBox="0 0 384 512" aria-hidden="true" focusable="false">` +
    `<path fill="currentColor" d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 53.3 0 70.5v371c0 17.2 9.4 33 24.5 41.9s33.7 8.4 48.5-.7l288-186c14.6-9.4 23.5-25.7 23.5-43s-8.9-33.6-23.5-43L73 39z"/>` +
    `</svg>` +
    `</button>` +
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
  if (typeof attributes.src === 'string' && attributes.src !== '') {
    wavegramAttributes.src = attributes.src;
  }
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

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
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

      const image = document.createElement('img');
      const alt = player.dataset.gifAlt || '';
      const styleText = player.dataset.gifStyle || '';
      const className = player.dataset.gifClass || '';

      image.src = src;
      image.alt = alt;
      if (className) image.className = className;
      copyDimensionStyle(image, styleText);
      image.classList.add('tmu-cs-gif-active');

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

    function getWavegramClickTarget(wavegram, event) {
      const root = wavegram.shadowRoot;
      if (!root) return undefined;

      const waveformPane = root.querySelector('.waveform-pane');
      const spectrogramPane = root.querySelector('.spectrogram-pane');
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      const canvas = path.find((element) => (
        element instanceof HTMLCanvasElement
        && (
          element.classList.contains('waveform')
          || element.classList.contains('spectrogram')
        )
      ));

      if (path.includes(waveformPane)) return { pane: waveformPane, canvas };
      if (path.includes(spectrogramPane)) return { pane: spectrogramPane, canvas };

      return undefined;
    }

    function getWavegramRelativeClickX(target, event) {
      if (
        target.canvas
        && Number.isFinite(event.offsetX)
        && target.canvas.clientWidth > 0
      ) {
        return clamp(event.offsetX / target.canvas.clientWidth, 0, 1);
      }

      const rect = target.pane.getBoundingClientRect();
      return rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0;
    }

    function dispatchWavegramTimelineEvent(wavegram, type, audio, duration) {
      wavegram.dispatchEvent(new CustomEvent(type, {
        detail: {
          currentTime: audio?.currentTime ?? 0,
          duration,
        },
      }));
    }

    function handleWavegramSeekClick(wavegram, event) {
      const target = getWavegramClickTarget(wavegram, event);
      const audio = wavegram.audio;
      const duration = Number.isFinite(wavegram.duration) && wavegram.duration > 0
        ? wavegram.duration
        : audio?.duration;
      if (!target || !audio || !Number.isFinite(duration) || duration <= 0) return false;

      event.preventDefault();
      event.stopImmediatePropagation();

      const relativeX = getWavegramRelativeClickX(target, event);
      const wasPaused = audio.paused;

      audio.currentTime = relativeX * duration;
      if (typeof wavegram.updateTimeLabels === 'function') wavegram.updateTimeLabels();
      if (typeof wavegram.drawCursors === 'function') wavegram.drawCursors();
      dispatchWavegramTimelineEvent(wavegram, 'seek', audio, duration);

      if (wasPaused) {
        wavegram.playRequestedAt = performance.now();
        audio.play().catch((error) => {
          if (typeof wavegram.handleError === 'function') wavegram.handleError('Audio playback failed.', error);
        });
      } else {
        audio.pause();
      }

      return true;
    }

    async function initSpectrogram(player) {
      if (!player || player.dataset.wavegramReady) return;

      const audio = player.querySelector('audio.wavesurfer-spectrogram');
      const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
      if (!audio || !wavegram) return;

      player.dataset.wavegramReady = 'true';
      wavegram.addEventListener('click', (event) => {
        if (handleWavegramSeekClick(wavegram, event)) return;
        event.stopPropagation();
      }, { capture: true });

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
  let hasGifPlayer = false;
  let hasSpectrogramPlayer = false;

  const output = String(html ?? '')
    .replace(/<img\b([^>]*)\/?>/g, (match, rawAttributes) => {
      const attributes = parseHtmlAttributes(rawAttributes);
      const source = attributes.src ?? '';

      if (!/\.gif(?:[?#][^"]*)?$/iu.test(source)) return match;
      if ('data-marp-twemoji' in attributes) return match;

      hasGifPlayer = true;
      return createAnimatedImagePlayerHtml(attributes);
    })
    .replace(/<audio\b([^>]*)>([\s\S]*?)<\/audio>/giu, (match, rawAttributes, innerHtml) => {
      const attributes = parseHtmlAttributes(rawAttributes);
      if (!hasClassToken(attributes.class, 'wavesurfer-spectrogram')) return match;

      if (typeof attributes.src === 'string' && attributes.src !== '') {
        attributes.src = tryInlineSpectrogramAudioSource(attributes.src, options);
      }

      hasSpectrogramPlayer = true;
      return createSpectrogramAudioPlayerHtml(attributes, innerHtml);
    });

  const normalizedOutput = hasSpectrogramPlayer ? unwrapBlockParagraphs(output) : output;
  return hasGifPlayer || hasSpectrogramPlayer
    ? `${normalizedOutput}${mediaRuntimeScript({ includeWavegram: hasSpectrogramPlayer })}`
    : normalizedOutput;
}
