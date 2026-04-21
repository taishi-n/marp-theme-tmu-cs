import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { escapeHtmlAttribute } from '../core/html.mjs';

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

  return (
    '<div class="tmu-cs-spectrogram-player" data-wavesurfer-spectrogram-player>' +
    '<div class="tmu-cs-spectrogram-player__toolbar">' +
    '<button type="button" class="tmu-cs-spectrogram-player__button" data-wavesurfer-play disabled>Play</button>' +
    '<button type="button" class="tmu-cs-spectrogram-player__button tmu-cs-spectrogram-player__button--secondary" data-wavesurfer-stop disabled>Stop</button>' +
    '<span class="tmu-cs-spectrogram-player__time" data-wavesurfer-time>000.000s</span>' +
    '<span class="tmu-cs-spectrogram-player__status" aria-live="polite">Loading spectrogram…</span>' +
    '</div>' +
    `<audio${audioAttributes ? ` ${audioAttributes}` : ''}>${innerHtml}</audio>` +
    '<div class="tmu-cs-spectrogram-player__waveform" data-wavesurfer-waveform></div>' +
    '<div class="tmu-cs-spectrogram-player__spectrogram" data-wavesurfer-spectrogram></div>' +
    '</div>'
  );
}

function unwrapBlockParagraphs(html) {
  return String(html ?? '').replace(
    /<p>\s*(<div class="tmu-cs-spectrogram-player"[\s\S]*?<\/div>)\s*<\/p>/giu,
    '$1',
  );
}

function mediaRuntimeScript() {
  return `<script>(() => {
    if (window.__tmuCsMediaEnhancementsLoaded) return;
    window.__tmuCsMediaEnhancementsLoaded = true;

    const waveSurferUrl = 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7.12.6/dist/wavesurfer.min.js';
    const spectrogramUrl = 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7.12.6/dist/plugins/spectrogram.min.js';
    let waveSurferReadyPromise;

    function copyDimensionStyle(el, styleText) {
      if (typeof styleText === 'string' && styleText.trim() !== '') el.style.cssText = styleText;
    }

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[src="' + src + '"]');
        if (existing) {
          if (existing.dataset.loaded === 'true') {
            resolve();
            return;
          }

          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)), { once: true });
          return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.addEventListener('load', () => {
          script.dataset.loaded = 'true';
          resolve();
        }, { once: true });
        script.addEventListener('error', () => reject(new Error('Failed to load ' + src)), { once: true });
        document.head.appendChild(script);
      });
    }

    function ensureWaveSurfer() {
      if (window.WaveSurfer?.Spectrogram) return Promise.resolve(window.WaveSurfer);
      if (!waveSurferReadyPromise) {
        waveSurferReadyPromise = loadScript(waveSurferUrl)
          .then(() => loadScript(spectrogramUrl))
          .then(() => {
            if (!window.WaveSurfer?.Spectrogram) {
              throw new Error('wavesurfer.js did not expose the Spectrogram plugin.');
            }

            return window.WaveSurfer;
          });
      }

      return waveSurferReadyPromise;
    }

    function parsePositiveInteger(value, fallbackValue) {
      const parsed = Number.parseInt(value || '', 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
    }

    function formatSeconds(value) {
      const seconds = Number.isFinite(value) && value >= 0 ? value : 0;
      const fixed = seconds.toFixed(3);
      const padded = seconds < 1000 ? fixed.padStart(7, '0') : fixed;
      return padded + 's';
    }

    function getThemeAccent(player) {
      const themedRoot = player.closest('section') || player;
      const styles = window.getComputedStyle(themedRoot);
      const accent = styles.getPropertyValue('--tmu-cs-accent').trim();
      return accent || '#006543';
    }

    function getPlayerWidth(player, fallbackWidth) {
      const width = Math.round(player.clientWidth || fallbackWidth || 0);
      return width > 0 ? width : 1;
    }

    function getContainerWidth(container, fallbackWidth) {
      const width = Math.round(container?.clientWidth || fallbackWidth || 0);
      return width > 0 ? width : 1;
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

    async function initSpectrogram(player) {
      if (!player || player.dataset.wavesurferReady) return;

      const audio = player.querySelector('audio.wavesurfer-spectrogram');
      const playButton = player.querySelector('[data-wavesurfer-play]');
      const stopButton = player.querySelector('[data-wavesurfer-stop]');
      const timeLabel = player.querySelector('[data-wavesurfer-time]');
      const waveform = player.querySelector('[data-wavesurfer-waveform]');
      const spectrogram = player.querySelector('[data-wavesurfer-spectrogram]');
      const status = player.querySelector('.tmu-cs-spectrogram-player__status');
      if (!audio || !waveform || !spectrogram || !playButton || !stopButton || !timeLabel) return;

      player.dataset.wavesurferReady = 'pending';

      try {
        const WaveSurfer = await ensureWaveSurfer();
        const accentColor = getThemeAccent(player);
        const spectrogramHeight = parsePositiveInteger(audio.dataset.spectrogramHeight, 100);
        const fftSamples = parsePositiveInteger(audio.dataset.spectrogramFftSamples, 1024);
        const maxCanvasWidth = getContainerWidth(
          spectrogram,
          getContainerWidth(waveform, getPlayerWidth(player, spectrogram.clientWidth || waveform.clientWidth)),
        );
        const sourceUrl = resolveAudioSource(audio);

        if (!sourceUrl) {
          throw new Error('No audio source was found for spectrogram rendering.');
        }

        const wavesurfer = WaveSurfer.create({
          container: waveform,
          media: audio,
          height: 84,
          waveColor: '#9cc8b5',
          progressColor: '#006543',
          cursorColor: '#1c2520',
          normalize: true,
        });

        wavesurfer.registerPlugin(
          WaveSurfer.Spectrogram.create({
            container: spectrogram,
            labels: true,
            height: spectrogramHeight,
            splitChannels: true,
            labelsBackground: accentColor,
            labelsColor: '#ffffff',
            labelsHzColor: '#ffffff',
            scale: 'linear',
            frequencyMax: 0,
            frequencyMin: 0,
            fftSamples,
            useWebWorker: true,
            maxCanvasWidth,
            noverlap: null,
            colorMap: 'roseus',
            gainDB: 20,
            rangeDB: 80,
            windowFunc: 'hann',
          }),
        );

        wavesurfer.load(sourceUrl).catch((error) => {
          player.dataset.wavesurferReady = 'error';
          if (status) status.textContent = error instanceof Error ? error.message : String(error);
          playButton.disabled = true;
          stopButton.disabled = true;
        });

        player.__wavesurfer = wavesurfer;
        if (status) status.textContent = 'Loading spectrogram…';
        if (timeLabel) timeLabel.textContent = formatSeconds(audio.currentTime);

        function updatePlaybackControls() {
          const ready = player.dataset.wavesurferReady === 'true';
          playButton.disabled = !ready;
          stopButton.disabled = !ready;
          playButton.textContent = wavesurfer.isPlaying() ? 'Pause' : 'Play';
          timeLabel.textContent = formatSeconds(audio.currentTime);
        }

        playButton.addEventListener('click', () => {
          wavesurfer.playPause();
        });

        stopButton.addEventListener('click', () => {
          wavesurfer.pause();
          wavesurfer.setTime(0);
          updatePlaybackControls();
          if (status) status.textContent = 'Stopped';
        });

        audio.addEventListener('timeupdate', updatePlaybackControls);
        audio.addEventListener('seeked', updatePlaybackControls);
        audio.addEventListener('loadedmetadata', updatePlaybackControls);

        wavesurfer.on('ready', () => {
          player.dataset.wavesurferReady = 'true';
          if (status) status.textContent = 'Ready';
          updatePlaybackControls();
        });

        wavesurfer.on('error', (error) => {
          player.dataset.wavesurferReady = 'error';
          if (status) status.textContent = error instanceof Error ? error.message : String(error);
          playButton.disabled = true;
          stopButton.disabled = true;
        });

        wavesurfer.on('play', () => {
          if (status) status.textContent = 'Playing';
          updatePlaybackControls();
        });

        wavesurfer.on('pause', () => {
          if (player.dataset.wavesurferReady === 'true' && status) status.textContent = audio.currentTime > 0 ? 'Paused' : 'Ready';
          updatePlaybackControls();
        });

        wavesurfer.on('finish', () => {
          if (status) status.textContent = 'Finished';
          updatePlaybackControls();
        });

        wavesurfer.on('spectrogram-click', (relativeX) => {
          wavesurfer.setTime(relativeX * wavesurfer.getDuration());
          updatePlaybackControls();
        });

        wavesurfer.on('spectrogram-ready', () => {
          if (player.dataset.wavesurferReady === 'true' && status) status.textContent = wavesurfer.isPlaying() ? 'Playing' : 'Ready';
        });

        audio.addEventListener('error', () => {
          player.dataset.wavesurferReady = 'error';
          if (status) status.textContent = 'Failed to load audio.';
          playButton.disabled = true;
          stopButton.disabled = true;
        }, { once: true });
      } catch (error) {
        player.dataset.wavesurferReady = 'error';
        if (status) status.textContent = error instanceof Error ? error.message : String(error);
        playButton.disabled = true;
        stopButton.disabled = true;
      }
    }

    document.querySelectorAll('.tmu-cs-gif-player').forEach(init);
    document.querySelectorAll('[data-wavesurfer-spectrogram-player]').forEach((player) => {
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
  return hasGifPlayer || hasSpectrogramPlayer ? `${normalizedOutput}${mediaRuntimeScript()}` : normalizedOutput;
}
