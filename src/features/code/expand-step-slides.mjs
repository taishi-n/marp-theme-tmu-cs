import {
  extractTrailingCommentDirective,
  isActualCodeLine,
  stripTrailingWhitespace,
} from '../../core/comment-directives.mjs';
import { joinLines, splitLinesPreservingEOF } from '../../core/text-lines.mjs';
import { isFenceClose, joinMarkdownSlides, parseFenceStart, splitMarkdownSlides } from '../../core/markdown.mjs';
import parseStepDirective from '../../shiki/parse-step-directive.mjs';
import { getLineCommentPrefix, normalizeFenceLanguage, supportsMagicComments } from './shared.mjs';

function extractStepComment(line, commentPrefix) {
  return extractTrailingCommentDirective(line, commentPrefix, '[!step');
}

function appendNotation(line, notations, commentPrefix) {
  if (notations.length === 0) return line;

  const suffix = notations.map((notation) => `${commentPrefix} ${notation}`).join(' ');
  return `${stripTrailingWhitespace(line)} ${suffix}`;
}

function collectStepMetadata(source, options = {}) {
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(source);
  const strippedLines = [];
  const actualCodeSourceLines = [];
  const pendingDirectives = [];
  const commentPrefix = options.commentPrefix ?? null;

  const warn = (lineNumber, message) => {
    options.onWarning?.({
      line: options.sourceLineOffset ? options.sourceLineOffset + lineNumber : lineNumber,
      message,
    });
  };

  const findPreviousActualCodeLine = () => actualCodeSourceLines.at(-1) ?? null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const directiveComment = extractStepComment(line, commentPrefix);

    if (!directiveComment) {
      strippedLines.push(line);
      if (isActualCodeLine(line, commentPrefix)) actualCodeSourceLines.push(strippedLines.length);
      continue;
    }

    if (directiveComment.hasTrailingContent) {
      warn(index + 1, 'step directive must appear at the end of the comment.');
      strippedLines.push(line);
      if (isActualCodeLine(line, commentPrefix)) actualCodeSourceLines.push(strippedLines.length);
      continue;
    }

    const sanitizedLine = directiveComment.renderedLine;
    let currentSourceLine = null;

    if (sanitizedLine !== null) {
      strippedLines.push(sanitizedLine);
      currentSourceLine = strippedLines.length;

      if (isActualCodeLine(sanitizedLine, commentPrefix)) actualCodeSourceLines.push(currentSourceLine);
    }

    const directive = parseStepDirective(directiveComment.comment, {
      lineNumber: index + 1,
      onWarning: ({ line, message }) => warn(line ?? index + 1, message),
    });

    if (!directive) continue;

    const anchorSourceLine = currentSourceLine && isActualCodeLine(sanitizedLine ?? '', commentPrefix)
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

function createCodeVariant(code, metadata, step, commentPrefix) {
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
    lines[index] = appendNotation(lines[index], notations, commentPrefix);
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
    const commentPrefix = getLineCommentPrefix(language);

    if (!supportsMagicComments(language) || !commentPrefix) {
      segments.push({
        type: 'fence',
        content: buildFenceBlock(openingLine, originalCode, closingLine),
      });
      continue;
    }

    const metadata = collectStepMetadata(originalCode, {
      commentPrefix,
      onWarning: options.onWarning,
      sourceLineOffset: openingLineNumber,
    });

    segments.push({
      type: 'step-fence',
      opening: openingLine,
      closing: closingLine,
      commentPrefix,
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
        createCodeVariant(segment.code, segment.metadata, step, segment.commentPrefix),
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
