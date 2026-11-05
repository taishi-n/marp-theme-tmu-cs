import { findStandaloneDirectives, joinMarkdownSlides, splitMarkdownSlides } from './markdown.mjs';

export const sourceMarkerPattern = /^<template data-tmu-cs-source="([A-Za-z0-9_-]+)"><\/template>[ \t]*$/mu;

export function stripSlideSource(markdown) {
  return String(markdown ?? '').replace(sourceMarkerPattern, '');
}

export function readSlideSource(markdown) {
  const match = String(markdown ?? '').trim().match(sourceMarkerPattern);
  return match ? JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')) : undefined;
}

export function annotateSlideSources(markdown) {
  const document = splitMarkdownSlides(markdown);
  const ids = new Set();
  return joinMarkdownSlides({
    ...document,
    slides: document.slides.map((slide, index) => {
      if (!slide.content.trim()) return slide;
      const directives = findStandaloneDirectives(slide.content, 'slide-id');
      if (directives.length > 1) throw new Error('[tmu-cs] use one slide-id per authored slide.');
      const explicitId = directives[0]?.value;
      if (explicitId !== undefined && !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(explicitId)) {
        throw new Error('[tmu-cs] slide-id must start with a letter and contain letters, digits, underscores, or hyphens.');
      }
      const id = explicitId ?? `@source-${index + 1}`;
      if (ids.has(id)) throw new Error(`[tmu-cs] duplicate slide-id: ${id}`);
      ids.add(id);
      const lines = slide.content.split('\n');
      for (const directive of directives) lines[directive.lineIndex] = '';
      const data = Buffer.from(JSON.stringify({ id, sourceLine: slide.startLine, sourceSlide: index + 1 })).toString('base64url');
      return { ...slide, content: `<template data-tmu-cs-source="${data}"></template>\n\n${lines.join('\n')}` };
    }),
  });
}
