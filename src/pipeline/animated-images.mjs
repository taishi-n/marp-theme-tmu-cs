function escapeHtmlAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
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

function animatedImageRuntimeScript() {
  return `<script>(() => {
    if (window.__tmuCsGifPlayerLoaded) return;
    window.__tmuCsGifPlayerLoaded = true;

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

    document.querySelectorAll('.tmu-cs-gif-player').forEach(init);
  })();</script>`;
}

export default function enhanceAnimatedImages(html) {
  let replaced = false;

  const output = String(html ?? '').replace(/<img\b([^>]*)\/?>/g, (match, rawAttributes) => {
    const attributes = parseHtmlAttributes(rawAttributes);
    const source = attributes.src ?? '';

    if (!/\.gif(?:[?#][^"]*)?$/iu.test(source)) return match;
    if ('data-marp-twemoji' in attributes) return match;

    replaced = true;
    return createAnimatedImagePlayerHtml(attributes);
  });

  return replaced ? `${output}${animatedImageRuntimeScript()}` : output;
}
