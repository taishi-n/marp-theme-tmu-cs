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

    function playGif(player) {
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

      const canvas = player.querySelector('.tmu-cs-gif-poster');
      const button = player.querySelector('.tmu-cs-gif-play-button');
      if (canvas) canvas.hidden = true;
      if (button) button.hidden = true;

      player.appendChild(image);
      player.dataset.gifPlaying = 'true';
    }

    function resetGif(player) {
      player.querySelector('.tmu-cs-gif-active')?.remove();
      const canvas = player.querySelector('.tmu-cs-gif-poster');
      const button = player.querySelector('.tmu-cs-gif-play-button');
      if (canvas) canvas.hidden = false;
      if (button) button.hidden = false;
      player.dataset.gifPlaying = 'false';
    }

    function initGif(player) {
      if (player.dataset.gifPlayerReady === 'true') return;
      player.dataset.gifPlayerReady = 'true';

      drawPoster(player);

      const button = player.querySelector('.tmu-cs-gif-play-button');
      if (button) button.addEventListener('click', function () {
        playGif(player);
      });
    }

    function safePlay(media) {
      if (!media || typeof media.play !== 'function') return;

      try {
        const playback = media.play();
        if (playback && typeof playback.catch === 'function') playback.catch(() => {});
      } catch {
        // A failed media item still counts as one navigation step.
      }
    }

    function resetNativeMedia(media) {
      if (!media) return;
      if (typeof media.pause === 'function') media.pause();
      try {
        media.currentTime = 0;
      } catch {
        // Media without loaded metadata may reject seeking.
      }
    }

    function initSpectrogram(player) {
      if (!player || player.dataset.wavegramReady) return;

      const audio = player.querySelector('audio.wavesurfer-spectrogram');
      const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
      if (!audio || !wavegram) return;

      player.dataset.wavegramReady = 'true';

      if (!wavegram.getAttribute('src')) {
        const sourceUrl = resolveAudioSource(audio);
        if (sourceUrl) wavegram.setAttribute('src', sourceUrl);
      }

      wavegram.addEventListener('loaded', function () {
        if (player.dataset.tmuCsSequencePlayRequested === 'true') safePlay(wavegram.audio);
      });
    }

    function playSpectrogram(player) {
      const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
      if (!wavegram) return;

      player.dataset.tmuCsSequencePlayRequested = 'true';
      if (wavegram.audio) safePlay(wavegram.audio);
    }

    function resetSpectrogram(player) {
      const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
      player.dataset.tmuCsSequencePlayRequested = 'false';
      if (wavegram) resetNativeMedia(wavegram.audio);
      resetNativeMedia(player.querySelector('audio.wavesurfer-spectrogram'));
    }

    const sequencePositions = new WeakMap();

    function getSequencePosition(section) {
      return sequencePositions.get(section) ?? 0;
    }

    function setSequencePosition(section, position) {
      sequencePositions.set(section, Math.max(0, position));
    }

    function getPlayableSteps(section) {
      if (!section) return [];

      return Array.from(section.querySelectorAll([
        '.tmu-cs-gif-player',
        '[data-wavegram-spectrogram-player]',
        'audio',
        'video',
      ].join(','))).filter((step) => {
        if (step.matches('audio.wavesurfer-spectrogram')) return false;
        if (step.matches('audio') && step.closest('[data-wavegram-spectrogram-player]')) return false;
        return true;
      });
    }

    function playStep(step) {
      if (step.classList.contains('tmu-cs-gif-player')) {
        playGif(step);
      } else if (step.hasAttribute('data-wavegram-spectrogram-player')) {
        playSpectrogram(step);
      } else {
        safePlay(step);
      }
    }

    function resetStep(step) {
      if (step.classList.contains('tmu-cs-gif-player')) {
        resetGif(step);
      } else if (step.hasAttribute('data-wavegram-spectrogram-player')) {
        resetSpectrogram(step);
      } else {
        resetNativeMedia(step);
      }
    }

    function playNextStep(section) {
      const steps = getPlayableSteps(section);
      const position = getSequencePosition(section);
      if (position >= steps.length) return false;

      setSequencePosition(section, position + 1);
      playStep(steps[position]);
      updateNavigationButtons(section);
      return true;
    }

    function resetPreviousStep(section) {
      const steps = getPlayableSteps(section);
      const position = Math.min(getSequencePosition(section), steps.length);
      if (position === 0) return false;

      const previousPosition = position - 1;
      setSequencePosition(section, previousPosition);
      resetStep(steps[previousPosition]);
      updateNavigationButtons(section);
      return true;
    }

    function resetSequence(section) {
      getPlayableSteps(section).forEach(resetStep);
      sequencePositions.delete(section);
    }

    const navigationButtonSelectors = {
      next: '[data-bespoke-marp-osc="next"], .bespoke-marp-presenter-info-page-next',
      prev: '[data-bespoke-marp-osc="prev"], .bespoke-marp-presenter-info-page-prev',
    };
    const originalDisabledAttribute = 'data-tmu-cs-original-disabled';

    function restoreNavigationButton(button) {
      if (!button.hasAttribute(originalDisabledAttribute)) return;
      button.disabled = button.getAttribute(originalDisabledAttribute) === 'true';
      button.removeAttribute(originalDisabledAttribute);
    }

    function overrideNavigationButton(button, enabled) {
      if (!enabled) {
        restoreNavigationButton(button);
        return;
      }

      if (!button.hasAttribute(originalDisabledAttribute)) {
        button.setAttribute(originalDisabledAttribute, String(button.disabled));
      }
      button.disabled = false;
    }

    function restoreNavigationButtons() {
      document.querySelectorAll('[' + originalDisabledAttribute + ']').forEach(restoreNavigationButton);
    }

    function getCurrentSequentialSection() {
      const view = document.body?.dataset?.bespokeView || '';
      if (view === 'next' || view === 'overview') return null;

      const activeSlide = document.querySelector('.bespoke-marp-slide.bespoke-marp-active');
      return activeSlide?.querySelector('section[data-media-playback="sequential"]') || null;
    }

    function updateNavigationButtons(section = getCurrentSequentialSection()) {
      restoreNavigationButtons();
      if (!section) return;

      const steps = getPlayableSteps(section);
      const position = Math.min(getSequencePosition(section), steps.length);
      const hasNextStep = position < steps.length;
      const hasPreviousStep = position > 0;
      document.querySelectorAll(navigationButtonSelectors.next).forEach((button) => {
        overrideNavigationButton(button, hasNextStep);
      });
      document.querySelectorAll(navigationButtonSelectors.prev).forEach((button) => {
        overrideNavigationButton(button, hasPreviousStep);
      });
    }

    function consumeNavigation(direction, section = getCurrentSequentialSection()) {
      if (!section) return false;
      return direction === 'next' ? playNextStep(section) : resetPreviousStep(section);
    }

    function stopNavigationEvent(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function isInteractiveTarget(target) {
      if (!(target instanceof Element)) return false;
      if (target.isContentEditable === true) return true;

      return Boolean(target.closest([
        'audio',
        'video',
        'button',
        'input',
        'select',
        'textarea',
        'wavegram-player',
      ].join(',')));
    }

    document.addEventListener('keydown', function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isInteractiveTarget(event.target)) return;

      let direction;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') direction = 'next';
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') direction = 'prev';
      if (!direction) return;

      const section = getCurrentSequentialSection();
      if (event.repeat && getPlayableSteps(section).length > 0) {
        stopNavigationEvent(event);
        return;
      }
      if (consumeNavigation(direction, section)) stopNavigationEvent(event);
    }, true);

    document.addEventListener('click', function (event) {
      if (event.shiftKey || !(event.target instanceof Element)) return;

      const nextButton = event.target.closest(navigationButtonSelectors.next);
      const previousButton = event.target.closest(navigationButtonSelectors.prev);
      const direction = nextButton ? 'next' : previousButton ? 'prev' : null;
      if (!direction || !consumeNavigation(direction)) return;

      (nextButton || previousButton)?.blur?.();
      stopNavigationEvent(event);
    }, true);

    document.querySelectorAll('.tmu-cs-gif-player').forEach(initGif);
    document.querySelectorAll('[data-wavegram-spectrogram-player]').forEach(initSpectrogram);

    let activeSection = null;
    function synchronizeActiveSection() {
      const nextSection = getCurrentSequentialSection();
      if (activeSection !== nextSection) {
        if (activeSection) resetSequence(activeSection);
        if (nextSection) resetSequence(nextSection);
      }
      activeSection = nextSection;
      updateNavigationButtons(nextSection);
    }

    const observer = new MutationObserver(synchronizeActiveSection);
    observer.observe(document.querySelector('.marpit') || document.documentElement, {
      attributeFilter: ['class'],
      attributes: true,
      subtree: true,
    });
    window.addEventListener('load', synchronizeActiveSection);
    setTimeout(synchronizeActiveSection, 0);
  })();</script>`;
}

export default function enhanceAnimatedImages(html, options = {}) {
  const sourceHtml = String(html ?? '');
  const document = parseHtmlWithLocations(sourceHtml);
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
  return hasGifPlayer || hasSpectrogramPlayer || hasSequentialPlayback
    ? `${normalizedOutput}${mediaRuntimeScript({ includeWavegram: hasSpectrogramPlayer })}`
    : normalizedOutput;
}
