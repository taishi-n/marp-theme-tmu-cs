import { joinLines, splitLinesPreservingEOF } from '../../core/text-lines.mjs';
import { isFenceClose, joinMarkdownSlides, parseFenceStart, splitMarkdownSlides } from '../../core/markdown.mjs';
import parseStepDirective from '../../shiki/parse-step-directive.mjs';
import { normalizeFenceLanguage } from './shared.mjs';

function stripTrailingWhitespace(line) {
  return line.replace(/[ \t]+$/u, '');
}

function isCommentOnlyLine(line) {
  return /^\s*\/\//.test(line);
}

function isActualCodeLine(line) {
  const trimmed = line.trim();
  return trimmed.length > 0 && !isCommentOnlyLine(line);
}

function extractStepComment(line) {
  const markerIndex = line.indexOf('[!step');
  if (markerIndex === -1) return null;

  const commentStart = line.lastIndexOf('//', markerIndex);
  if (commentStart === -1) return null;

  const beforeComment = line.slice(0, commentStart);

  return {
    beforeComment,
    comment: line.slice(commentStart),
    isCommentOnly: beforeComment.trim().length === 0,
  };
}

function appendNotation(line, notations) {
  if (notations.length === 0) return line;

  const suffix = notations.map((notation) => `// ${notation}`).join(' ');
  return `${stripTrailingWhitespace(line)} ${suffix}`;
}

function collectStepMetadata(source, options = {}) {
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(source);
  const strippedLines = [];
  const actualCodeSourceLines = [];
  const pendingDirectives = [];

  const warn = (lineNumber, message) => {
    options.onWarning?.({
      line: options.sourceLineOffset ? options.sourceLineOffset + lineNumber : lineNumber,
      message,
    });
  };

  const findPreviousActualCodeLine = () => actualCodeSourceLines.at(-1) ?? null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const directiveComment = extractStepComment(line);

    if (!directiveComment) {
      strippedLines.push(line);
      if (isActualCodeLine(line)) actualCodeSourceLines.push(strippedLines.length);
      continue;
    }

    const sanitizedLine = directiveComment.isCommentOnly ? null : stripTrailingWhitespace(directiveComment.beforeComment);
    let currentSourceLine = null;

    if (sanitizedLine !== null) {
      strippedLines.push(sanitizedLine);
      currentSourceLine = strippedLines.length;

      if (isActualCodeLine(sanitizedLine)) actualCodeSourceLines.push(currentSourceLine);
    }

    const directive = parseStepDirective(directiveComment.comment, {
      lineNumber: index + 1,
      onWarning: ({ line, message }) => warn(line ?? index + 1, message),
    });

    if (!directive) continue;

    const anchorSourceLine = currentSourceLine && isActualCodeLine(sanitizedLine ?? '')
      ? currentSourceLine
      : findPreviousActualCodeLine();

    if (!anchorSourceLine) {
      warn(index + 1, 'step directive has no preceding actual code line to attach to.');
      continue;
    }

    pendingDirectives.push({
      ...directive,
      anchorSourceLine,
      lineNumber: index + 1,
    });
  }

  const directives = pendingDirectives.flatMap((directive) => {
    const anchorPosition = actualCodeSourceLines.indexOf(directive.anchorSourceLine);
    const targetSourceLines = actualCodeSourceLines.slice(anchorPosition, anchorPosition + directive.range);

    if (targetSourceLines.length === 0) {
      warn(directive.lineNumber, 'step directive resolved to an empty target range.');
      return [];
    }

    return [{
      ...directive,
      sourceLines: targetSourceLines,
    }];
  });

  return {
    code: joinLines(strippedLines, hasTrailingNewline),
    directives,
    steps: [...new Set(directives.map((directive) => directive.step))].sort((left, right) => left - right),
  };
}

function createCodeVariant(code, metadata, step) {
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(code);
  const notationsByLine = new Map();

  for (const directive of metadata.directives) {
    if (directive.step !== step) continue;

    const notation = `[!code ${directive.action}${directive.range > 1 ? `:${directive.range}` : ''}]`;
    const existing = notationsByLine.get(directive.anchorSourceLine) ?? [];
    existing.push(notation);
    notationsByLine.set(directive.anchorSourceLine, existing);
  }

  for (const [lineNumber, notations] of notationsByLine.entries()) {
    const index = lineNumber - 1;
    lines[index] = appendNotation(lines[index], notations);
  }

  return joinLines(lines, hasTrailingNewline);
}

function buildFenceBlock(opening, code, closing) {
  return `${opening}\n${code}\n${closing}`;
}

function expandSlide(slide, options = {}) {
  const { lines } = splitLinesPreservingEOF(slide.content);
  const segments = [];
  let segmentLines = [];
  let localLineIndex = 0;

  while (localLineIndex < lines.length) {
    const line = lines[localLineIndex];
    const fenceStart = parseFenceStart(line);

    if (!fenceStart) {
      segmentLines.push(line);
      localLineIndex += 1;
      continue;
    }

    if (segmentLines.length > 0) {
      segments.push({
        type: 'markdown',
        content: segmentLines.join('\n'),
      });
      segmentLines = [];
    }

    const openingLine = line;
    const openingLineNumber = slide.startLine + localLineIndex;
    const codeLines = [];
    localLineIndex += 1;

    while (localLineIndex < lines.length && !isFenceClose(lines[localLineIndex], fenceStart)) {
      codeLines.push(lines[localLineIndex]);
      localLineIndex += 1;
    }

    const closingLine = localLineIndex < lines.length ? lines[localLineIndex] : `${fenceStart.marker.repeat(fenceStart.length)}`;
    localLineIndex += 1;

    const originalCode = codeLines.join('\n');
    const language = normalizeFenceLanguage(fenceStart.info);

    if (language !== 'cpp') {
      segments.push({
        type: 'fence',
        content: buildFenceBlock(openingLine, originalCode, closingLine),
      });
      continue;
    }

    const metadata = collectStepMetadata(originalCode, {
      onWarning: options.onWarning,
      sourceLineOffset: openingLineNumber,
    });

    segments.push({
      type: 'step-fence',
      opening: openingLine,
      closing: closingLine,
      originalCode,
      code: metadata.code,
      metadata,
    });
  }

  if (segmentLines.length > 0) {
    segments.push({
      type: 'markdown',
      content: segmentLines.join('\n'),
    });
  }

  const steps = [...new Set(
    segments
      .filter((segment) => segment.type === 'step-fence')
      .flatMap((segment) => segment.metadata.steps),
  )].sort((left, right) => left - right);

  if (steps.length === 0) {
    const hasSanitizedChange = segments.some(
      (segment) => segment.type === 'step-fence' && segment.originalCode !== segment.code,
    );

    if (!hasSanitizedChange) return [slide.content];

    return [segments.map((segment) => {
      if (segment.type === 'markdown' || segment.type === 'fence') return segment.content;
      return buildFenceBlock(segment.opening, segment.code, segment.closing);
    }).join('\n')];
  }

  return steps.map((step) =>
    segments.map((segment) => {
      if (segment.type === 'markdown' || segment.type === 'fence') return segment.content;
      return buildFenceBlock(
        segment.opening,
        createCodeVariant(segment.code, segment.metadata, step),
        segment.closing,
      );
    }).join('\n'),
  );
}

export function expandStepSlides(markdown, options = {}) {
  const normalized = String(markdown ?? '').replace(/\r\n/g, '\n');
  const document = splitMarkdownSlides(normalized);
  const expandedSlides = document.slides.flatMap((slide) => expandSlide(slide, options));
  return joinMarkdownSlides({
    frontMatter: document.frontMatter,
    slides: expandedSlides,
    hasTrailingNewline: document.hasTrailingNewline,
  });
}

export default expandStepSlides;
