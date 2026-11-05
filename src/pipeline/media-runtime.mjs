import { installSpectrogramVisibility } from './spectrogram-visibility.mjs';
import { linkAudioDownload } from './audio-download.mjs';

export function mediaRuntimeScript({ gif = false, spectrogram = false, sequential = false, wavegramBundle = '' } = {}) {
  const gifCode = gif ? `
    function copyDimensionStyle(el, styleText) {
      if (typeof styleText === 'string' && styleText.trim() !== '') el.style.cssText = styleText;
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

` : '';
  const nativeCode = spectrogram || sequential ? `
    function safePlay(media) {
      if (!media || typeof media.play !== 'function') return;

      try {
        const playback = media.play();
        if (playback && typeof playback.catch === 'function') playback.catch(() => {});
      } catch {
        // A failed media item still counts as one navigation step.
      }
    }

    function pauseNativeMedia(media) {
      if (media && typeof media.pause === 'function') media.pause();
    }

    function resetNativeMedia(media) {
      if (!media) return;
      pauseNativeMedia(media);
      try {
        media.currentTime = 0;
      } catch {
        // Media without loaded metadata may reject seeking.
      }
    }

` : '';
  const spectrogramCode = spectrogram ? `
    function resolveAudioSource(audio) {
      if (!audio) return '';
      if (audio.currentSrc) return audio.currentSrc;
      if (audio.src) return audio.src;

      const source = audio.querySelector('source[src]');
      return source ? source.src || source.getAttribute('src') || '' : '';
    }

    function initSpectrogram(player) {
      if (!player || player.dataset.wavegramReady) return;

      const audio = player.querySelector('audio.wavesurfer-spectrogram');
      const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
      if (!audio || !wavegram) return;

      player.dataset.wavegramReady = 'true';
      const sourceUrl = resolveAudioSource(audio);
      linkAudioDownload(player, sourceUrl);

      if (!wavegram.getAttribute('src')) {
        if (sourceUrl) wavegram.setAttribute('src', sourceUrl);
      }

      wavegram.addEventListener('loaded', function () {
        if (player.dataset.tmuCsSequencePlayRequested === 'true') safePlay(wavegram.audio);
      });
    }

    function playSpectrogram(player) {
      spectrogramVisibility.activate(player);
      const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
      if (!wavegram) return;

      player.dataset.tmuCsSequencePlayRequested = 'true';
      if (wavegram.audio) safePlay(wavegram.audio);
    }

    function pauseSpectrogram(player) {
      const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
      player.dataset.tmuCsSequencePlayRequested = 'false';
      if (wavegram) pauseNativeMedia(wavegram.audio);
      pauseNativeMedia(player.querySelector('audio.wavesurfer-spectrogram'));
    }

    function resetSpectrogram(player) {
      const wavegram = player.querySelector('wavegram-player[data-wavegram-player]');
      pauseSpectrogram(player);
      if (wavegram) resetNativeMedia(wavegram.audio);
      resetNativeMedia(player.querySelector('audio.wavesurfer-spectrogram'));
    }

` : '';
  const sequentialCode = sequential ? `
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

    const playbackHandlers = [
      ${gif ? `{ matches: step => step.classList.contains('tmu-cs-gif-player'), play: playGif, pause: resetGif, reset: resetGif,
        isPlaying: step => step.dataset.gifPlaying === 'true' },` : ''}
      ${spectrogram ? `{ matches: step => step.hasAttribute('data-wavegram-spectrogram-player'), play: playSpectrogram, pause: pauseSpectrogram, reset: resetSpectrogram,
        isPlaying: step => step.dataset.tmuCsSequencePlayRequested === 'true' || step.querySelector('wavegram-player[data-wavegram-player]')?.audio?.paused === false || step.querySelector('audio.wavesurfer-spectrogram')?.paused === false },` : ''}
      { matches: () => true, play: safePlay, pause: pauseNativeMedia, reset: resetNativeMedia, isPlaying: step => step.paused === false },
    ];
    function handlerFor(step) { return playbackHandlers.find(handler => handler.matches(step)); }
    function playStep(step) { handlerFor(step).play(step); }
    function pauseStep(step) { handlerFor(step).pause(step); }
    function isStepPlaying(step) { return handlerFor(step).isPlaying(step); }

    function pausePlayingSteps(section) {
      getPlayableSteps(section).filter(isStepPlaying).forEach(pauseStep);
    }

    function resetStep(step) { handlerFor(step).reset(step); }

    function playNextStep(section) {
      const steps = getPlayableSteps(section);
      const position = getSequencePosition(section);
      if (position >= steps.length) return false;

      pausePlayingSteps(section);
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
      if (event.key === 'ArrowRight') direction = 'next';
      if (event.key === 'ArrowLeft') direction = 'prev';
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

` : '';
  const synchronizationCode = spectrogram || sequential ? `
    ${sequential ? 'let activeSection = null;' : ''}
    function synchronizeActiveSection() {
      ${sequential ? `const nextSection = getCurrentSequentialSection();
      if (activeSection !== nextSection) {
        if (activeSection) resetSequence(activeSection);
        if (nextSection) resetSequence(nextSection);
      }
      activeSection = nextSection;
      updateNavigationButtons(nextSection);` : ''}
      ${spectrogram ? 'spectrogramVisibility.synchronize();' : ''}
    }

    let synchronizationPending = false;
    function scheduleSynchronization() {
      if (synchronizationPending) return;
      synchronizationPending = true;
      const requestFrame = window.requestAnimationFrame?.bind(window) || ((callback) => setTimeout(callback, 0));
      requestFrame(() => {
        synchronizationPending = false;
        synchronizeActiveSection();
      });
    }
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === 'data-bespoke-view' ||
        record.target.classList?.contains('bespoke-marp-slide'))) scheduleSynchronization();
    });
    observer.observe(document.querySelector('.marpit') || document.documentElement, {
      attributeFilter: ['class'],
      attributes: true,
      subtree: true,
    });
    if (document.body) observer.observe(document.body, {
      attributeFilter: ['data-bespoke-view'], attributes: true,
    });
    window.addEventListener('load', scheduleSynchronization);
    document.addEventListener('DOMContentLoaded', scheduleSynchronization);
    setTimeout(scheduleSynchronization, 0);
` : '';
  return `<script>${spectrogram ? wavegramBundle : ''}
(() => {
    if (window.__tmuCsMediaEnhancementsLoaded) return;
    window.__tmuCsMediaEnhancementsLoaded = true;
    ${spectrogram ? linkAudioDownload.toString() : ''}
    ${gifCode}${nativeCode}${spectrogramCode}${sequentialCode}
    ${gif ? "document.querySelectorAll('.tmu-cs-gif-player').forEach(initGif);" : ''}
    ${spectrogram ? `const spectrogramVisibility = (${installSpectrogramVisibility.toString()})({
      document, window, initialize: initSpectrogram, pause: pauseSpectrogram,
    });` : ''}
    ${synchronizationCode}
})();</script>`;
}
