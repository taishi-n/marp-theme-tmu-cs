import { deflateSync } from 'node:zlib';
import { escapeHtmlAttribute } from '../../core/html.mjs';
import { isDiagramLanguage } from './languages.mjs';

function normalizeLanguage(language) {
  return String(language ?? '').trim().toLowerCase();
}

function encodeKrokiSource(source) {
  return deflateSync(String(source ?? ''), {
    level: 9,
  }).toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

export function createKrokiBackend(options = {}) {
  const entrypoint = String(options.entrypoint ?? 'https://kroki.io/').replace(/\/?$/u, '/');
  const format = String(options.format ?? 'svg').trim().toLowerCase();

  return {
    supports(language) {
      return isDiagramLanguage(normalizeLanguage(language));
    },
    renderFence({ language, source }) {
      const normalizedLanguage = normalizeLanguage(language);
      if (!isDiagramLanguage(normalizedLanguage)) return null;

      const encodedSource = encodeKrokiSource(source);
      const url = `${entrypoint}${normalizedLanguage}/${format}/${encodedSource}`;
      const alt = `${normalizedLanguage} diagram`;

      return `<p><marp-auto-scaling data-downscale-only><img src="${url}" alt="${escapeHtmlAttribute(alt)}" /></marp-auto-scaling></p>`;
    },
  };
}
