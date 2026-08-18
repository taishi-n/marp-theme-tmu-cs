import {
  isFenceClose,
  joinMarkdownSlides,
  parseFenceStart,
  splitMarkdownSlides,
} from '../core/markdown.mjs';

export const sequentialMediaPlaybackMarker = (
  '<span class="tmu-cs-slide-class--media-playback-sequential"></span>'
);

const localDirectivePattern = /^\s*<!--\s*_mediaPlayback\s*:\s*(.*?)\s*-->\s*$/u;

export function normalizeMediaPlaybackMode(value) {
  if (value === true) return 'sequential';
  if (value === false || value === undefined || value === null) return 'off';

  const normalized = String(value).trim().toLowerCase();
  if (['sequential', 'sequence', 'on', 'true'].includes(normalized)) return 'sequential';
  if (['off', 'none', 'false'].includes(normalized)) return 'off';
  return undefined;
}

function removeLocalDirectives(content, options = {}) {
  const lines = String(content ?? '').replace(/\r\n/g, '\n').split('\n');
  const output = [];
  let foundDirective = false;
  let fence = null;
  let inHtmlComment = false;
  let localMode;

  for (const line of lines) {
    if (!fence) {
      if (inHtmlComment) {
        output.push(line);
        if (line.includes('-->')) inHtmlComment = false;
        continue;
      }

      const fenceStart = parseFenceStart(line);
      if (fenceStart) {
        fence = fenceStart;
        output.push(line);
        continue;
      }

      const directive = line.match(localDirectivePattern);
      if (directive) {
        foundDirective = true;
        const mode = normalizeMediaPlaybackMode(directive[1]);
        if (mode === undefined) {
          options.onWarning?.(`Ignoring invalid _mediaPlayback value "${directive[1]}".`);
        } else {
          localMode = mode;
        }
        continue;
      }

      const commentStart = line.indexOf('<!--');
      if (commentStart >= 0 && line.indexOf('-->', commentStart + 4) < 0) {
        inHtmlComment = true;
      }
    } else if (isFenceClose(line, fence)) {
      fence = null;
    }

    output.push(line);
  }

  return {
    content: output.join('\n'),
    foundDirective,
    localMode,
  };
}

function appendSequentialMarker(content) {
  const normalized = String(content ?? '').replace(/[ \t]+$/gmu, '').trimEnd();
  return normalized === ''
    ? sequentialMediaPlaybackMarker
    : `${normalized}\n\n${sequentialMediaPlaybackMarker}`;
}

export default function applyMediaPlayback(markdown, options = {}) {
  const defaultMode = normalizeMediaPlaybackMode(options.defaultMode);
  if (defaultMode === undefined) {
    options.onWarning?.(`Ignoring invalid mediaPlayback value "${options.defaultMode}".`);
  }

  const source = String(markdown ?? '');
  if (defaultMode !== 'sequential' && !source.includes('_mediaPlayback')) return source;

  const document = splitMarkdownSlides(source);
  let foundLocalDirective = false;
  const slides = document.slides.map((slide) => {
    const processed = removeLocalDirectives(slide.content, options);
    foundLocalDirective ||= processed.foundDirective;
    const mode = processed.localMode ?? defaultMode ?? 'off';

    return {
      ...slide,
      content: mode === 'sequential'
        ? appendSequentialMarker(processed.content)
        : processed.content,
    };
  });

  if (defaultMode !== 'sequential' && !foundLocalDirective) return source;

  return joinMarkdownSlides({
    ...document,
    slides,
  });
}
